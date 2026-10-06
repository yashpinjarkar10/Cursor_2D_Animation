from __future__ import annotations

from typing import Any

from config import (
    KNOWLEDGE_API_LIMIT,
    KNOWLEDGE_APIS_PER_CAPABILITY,
    KNOWLEDGE_CAPABILITY_LIMIT,
    KNOWLEDGE_EXAMPLES_PER_API,
    KNOWLEDGE_EXAMPLE_LIMIT,
    KNOWLEDGE_RELATED_APIS_PER_API,
)

from knowledge.repository.chroma_repository import (
    ChromaKnowledgeRepository,
)
from knowledge.repository.relationship_repository import (
    RelationshipRepository,
)


class ManimKnowledge:
    """
    High-level Manim knowledge service.

    Combines:

        ChromaKnowledgeRepository
            -> semantic retrieval

        RelationshipRepository
            -> deterministic relationship traversal

    Future agents should use this class instead of directly
    accessing Chroma or the static JSON files.
    """

    def __init__(
        self,
        chroma_repository: ChromaKnowledgeRepository | None = None,
        relationship_repository: RelationshipRepository | None = None,
    ) -> None:

        self.chroma = (
            chroma_repository
            if chroma_repository is not None
            else ChromaKnowledgeRepository()
        )

        self.relationships = (
            relationship_repository
            if relationship_repository is not None
            else RelationshipRepository()
        )

    # ==================================================================
    # Semantic retrieval
    # ==================================================================

    def search_capabilities(
        self,
        query: str,
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """
        Semantic search over Manim capabilities.
        """

        return self.chroma.search_capabilities(
            query=query,
            limit=top_k,
        )

    def search_apis(
        self,
        query: str,
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """
        Semantic search over Manim APIs.
        """

        return self.chroma.search_apis(
            query=query,
            limit=top_k,
        )

    def search_examples(
        self,
        query: str,
        top_k: int = 3,
    ) -> list[dict[str, Any]]:
        """
        Semantic search over official Manim examples.
        """

        return self.chroma.search_examples(
            query=query,
            limit=top_k,
        )

    # ==================================================================
    # Exact retrieval
    # ==================================================================

    def get_capability(
        self,
        capability_id: str,
    ) -> dict[str, Any] | None:

        return self.chroma.get_capability(
            capability_id
        )

    def get_api(
        self,
        api_qualified_name: str,
    ) -> dict[str, Any] | None:

        return self.chroma.get_api(
            api_qualified_name
        )

    def get_example(
        self,
        example_id: str,
    ) -> dict[str, Any] | None:

        return self.chroma.get_example(
            example_id
        )

    # ==================================================================
    # Relationship retrieval
    # ==================================================================

    def get_related_apis(
        self,
        api_qualified_name: str,
        relation_types: set[str] | None = None,
    ) -> list[dict[str, Any]]:

        return self.relationships.get_related_apis(
            api_qualified_name,
            relation_types=relation_types,
        )

    def get_api_examples(
        self,
        api_qualified_name: str,
    ) -> list[str]:

        return self.relationships.get_api_examples(
            api_qualified_name
        )

    def get_example_apis(
        self,
        example_id: str,
    ) -> list[str]:

        return self.relationships.get_example_apis(
            example_id
        )

    def get_example_api_usage(
        self,
        example_id: str,
    ) -> list[dict[str, Any]]:

        return self.relationships.get_example_api_usage(
            example_id
        )

    def get_api_usage_in_example(
        self,
        api_qualified_name: str,
        example_id: str,
    ) -> list[dict[str, Any]]:

        return self.relationships.get_api_usage_in_example(
            api_qualified_name,
            example_id,
        )

    # ==================================================================
    # Capability expansion
    # ==================================================================

    def get_capability_context(
        self,
        capability_id: str,
        max_apis: int = 10,
        max_examples_per_api: int = 3,
        include_related_apis: bool = True,
    ) -> dict[str, Any]:
        """
        Expand a capability into implementation context.

        Capability
            -> APIs
            -> related APIs
            -> official examples
        """

        capability = self.get_capability(
            capability_id
        )

        if capability is None:
            return {
                "capability": None,
                "apis": [],
                "related_apis": [],
                "examples": [],
            }

        api_names = capability.get(
            "apis",
            [],
        )

        if not isinstance(api_names, list):
            api_names = []

        api_names = [
            api
            for api in api_names
            if isinstance(api, str)
        ]

        # --------------------------------------------------------------
        # Resolve APIs
        # --------------------------------------------------------------

        apis: list[dict[str, Any]] = []

        for api_name in api_names:
            api = self.get_api(
                api_name
            )

            if api is not None:
                apis.append(api)
            if len(apis) >= max_apis:
                break

        if api_names and not apis:
            return {
                "capability": capability,
                "apis": [],
                "related_apis": [],
                "examples": [],
            }

        # --------------------------------------------------------------
        # Related APIs
        # --------------------------------------------------------------

        related_apis: list[dict[str, Any]] = []
        related_seen: set[str] = set()

        if include_related_apis:

            for api_name in api_names:

                relationships = (
                    self.get_related_apis(
                        api_name
                    )
                )

                for relationship in relationships:

                    target = relationship.get(
                        "target"
                    )

                    if not target:
                        continue

                    if target in related_seen:
                        continue

                    related_seen.add(
                        target
                    )

                    related_apis.append(
                        relationship
                    )

        # --------------------------------------------------------------
        # Examples
        # --------------------------------------------------------------

        example_ids: list[str] = []
        example_seen: set[str] = set()

        for api_name in api_names:

            ids = self.get_api_examples(
                api_name
            )

            for example_id in ids[
                :max_examples_per_api
            ]:

                if example_id in example_seen:
                    continue

                example_seen.add(
                    example_id
                )

                example_ids.append(
                    example_id
                )

        examples: list[dict[str, Any]] = []

        for example_id in example_ids:

            example = self.get_example(
                example_id
            )

            if example is not None:
                examples.append(
                    example
                )

        return {
            "capability": capability,
            "apis": apis,
            "related_apis": related_apis,
            "examples": examples,
        }

    # ==================================================================
    # Hybrid implementation retrieval
    # ==================================================================

    def search_implementation_context(
        self,
        query: str,
        top_k_capabilities: int = KNOWLEDGE_CAPABILITY_LIMIT,
        top_k_apis: int = KNOWLEDGE_API_LIMIT,
        top_k_examples: int = KNOWLEDGE_EXAMPLE_LIMIT,
        max_apis_per_capability: int = KNOWLEDGE_APIS_PER_CAPABILITY,
        max_examples_per_api: int = KNOWLEDGE_EXAMPLES_PER_API,
        max_related_apis_per_api: int = KNOWLEDGE_RELATED_APIS_PER_API,
    ) -> dict[str, Any]:
        """
        Hybrid semantic + relationship retrieval.

        Flow:

            Query
              |
              +--> semantic capabilities
              |
              +--> semantic APIs
              |
              +--> semantic examples
              |
              +--> capability APIs
                        |
                        +--> related APIs
                        |
                        +--> official examples
        """

        # --------------------------------------------------------------
        # 1. Semantic capabilities
        # --------------------------------------------------------------

        capability_results = (
            self.search_capabilities(
                query=query,
                top_k=top_k_capabilities,
            )
        )

        # --------------------------------------------------------------
        # 2. Semantic APIs
        # --------------------------------------------------------------

        api_results = (
            self.search_apis(
                query=query,
                top_k=top_k_apis,
            )
        )

        # --------------------------------------------------------------
        # 3. Semantic examples
        # --------------------------------------------------------------

        example_results = (
            self.search_examples(
                query=query,
                top_k=top_k_examples,
            )
        )

        # --------------------------------------------------------------
        # 4. Extract APIs from capabilities
        # --------------------------------------------------------------

        capability_api_names: list[str] = []
        capability_api_seen: set[str] = set()

        for result in capability_results:

            capability = self._extract_record(
                result
            )

            if capability is None:
                continue

            api_names = capability.get(
                "apis",
                [],
            )

            if not isinstance(api_names, list):
                continue

            for api_name in api_names[
                :max_apis_per_capability
            ]:

                if not isinstance(
                    api_name,
                    str,
                ):
                    continue

                if api_name in capability_api_seen:
                    continue

                capability_api_seen.add(
                    api_name
                )

                capability_api_names.append(
                    api_name
                )

        for result in api_results:
            api_name = self._record_id(result)
            if api_name and api_name not in capability_api_seen:
                capability_api_seen.add(api_name)
                capability_api_names.append(api_name)

        # --------------------------------------------------------------
        # 5. Resolve capability APIs
        # --------------------------------------------------------------

        capability_apis: list[dict[str, Any]] = []

        for api_name in capability_api_names:

            api = self.get_api(
                api_name
            )

            if api is not None:
                capability_apis.append(
                    api
                )

        # --------------------------------------------------------------
        # 6. Related APIs
        # --------------------------------------------------------------

        related_apis: list[dict[str, Any]] = []
        related_seen: set[str] = set()

        for api_name in capability_api_names:

            relationships = (
                self.get_related_apis(
                    api_name
                )
            )

            count = 0

            for relationship in relationships:

                target = relationship.get(
                    "target"
                )

                if not target:
                    continue

                if target in related_seen:
                    continue

                related_seen.add(
                    target
                )

                related_apis.append(
                    relationship
                )

                count += 1

                if count >= max_related_apis_per_api:
                    break

        # --------------------------------------------------------------
        # 7. API -> official examples
        # --------------------------------------------------------------

        relationship_example_ids: list[str] = []
        relationship_example_seen: set[str] = set()

        for api_name in capability_api_names:

            example_ids = (
                self.get_api_examples(
                    api_name
                )
            )

            for example_id in example_ids[
                :max_examples_per_api
            ]:

                if (
                    example_id
                    in relationship_example_seen
                ):
                    continue

                relationship_example_seen.add(
                    example_id
                )

                relationship_example_ids.append(
                    example_id
                )

        # --------------------------------------------------------------
        # 8. Resolve examples
        # --------------------------------------------------------------

        relationship_examples: list[
            dict[str, Any]
        ] = []

        for example_id in relationship_example_ids:

            example = self.get_example(
                example_id
            )

            if example is not None:
                relationship_examples.append(
                    example
                )

        semantic_api_records: list[dict[str, Any]] = []
        semantic_api_seen: set[str] = set()
        for result in api_results:
            api_id = self._record_id(result)
            if not api_id or api_id in semantic_api_seen:
                continue
            exact_api = self.get_api(api_id)
            if exact_api is None:
                continue
            semantic_api_seen.add(api_id)
            semantic_api_records.append(
                {
                    **exact_api,
                    "retrieval_distance": result.get("distance"),
                }
            )

        implementation_candidates: list[dict[str, Any]] = []
        implementation_seen: set[str] = set()
        for api in [*capability_apis, *semantic_api_records]:
            api_id = self._record_id(api)
            if not api_id or api_id in implementation_seen:
                continue
            implementation_seen.add(api_id)
            implementation_candidates.append(api)

        api_usage: list[dict[str, Any]] = []
        usage_seen: set[tuple[str, str, str]] = set()
        for example_id in relationship_example_ids:
            for api_id in self.get_example_apis(example_id):
                for usage in self.get_api_usage_in_example(api_id, example_id):
                    usage_key = (
                        api_id,
                        example_id,
                        str(usage.get("line") or usage.get("usage_type") or len(api_usage)),
                    )
                    if usage_key in usage_seen:
                        continue
                    usage_seen.add(usage_key)
                    api_usage.append(
                        {
                            "api_id": api_id,
                            "example_id": example_id,
                            **usage,
                        }
                    )

        # --------------------------------------------------------------
        # 9. Return complete context
        # --------------------------------------------------------------

        return {
            "query": query,

            "capabilities": capability_results,

            "semantic_apis": api_results,

            "semantic_examples": example_results,

            "capability_apis": capability_apis,

            "related_apis": related_apis,

            "relationship_examples": (
                relationship_examples
            ),
            "api_usage": api_usage,
            "implementation_candidates": implementation_candidates,
        }

    # ==================================================================
    # Helpers
    # ==================================================================

    @staticmethod
    def _extract_record(
        result: dict[str, Any],
    ) -> dict[str, Any] | None:
        """
        Normalize a Chroma search result.

        Supports both:
            direct records
        and:
            {"metadata": {...}}
        """

        if not isinstance(
            result,
            dict,
        ):
            return None

        if (
            "id" in result
            or "name" in result
        ):
            return result

        metadata = result.get(
            "metadata"
        )

        if isinstance(
            metadata,
            dict,
        ):
            return metadata

        return result

    @staticmethod
    def _record_id(record: dict[str, Any]) -> str | None:
        value = record.get("id") or record.get("qualified_name") or record.get("name")
        return value if isinstance(value, str) and value else None

    # ==================================================================
    # Health
    # ==================================================================

    def health(self) -> dict[str, Any]:

        return {
            "status": "ok",
            "chroma": self.chroma.health(),
            "relationships": (
                self.relationships.health()
            ),
        }