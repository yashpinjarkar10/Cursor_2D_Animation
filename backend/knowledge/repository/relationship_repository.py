from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class RelationshipRepository:
    """
    Deterministic repository for Manim API/example relationships.

    Static sources:
        - api_relationships.json
        - examples_with_apis.json

    Provides:
        - API -> related APIs
        - API -> examples
        - Example -> APIs
        - Example -> detailed API usage
        - API + Example -> usage details
    """

    def __init__(
        self,
        static_dir: str | Path | None = None,
    ) -> None:
        if static_dir is None:
            static_dir = Path(__file__).resolve().parent.parent / "static"

        self.static_dir = Path(static_dir)

        self.api_relationships_file = (
            self.static_dir / "api_relationships.json"
        )

        self.examples_file = (
            self.static_dir / "examples_with_apis.json"
        )

        self._api_relationships: list[dict[str, Any]] = []
        self._examples: list[dict[str, Any]] = []

        # ------------------------------------------------------------------
        # Indexes
        # ------------------------------------------------------------------

        # API -> related API relationships
        #
        # Example:
        # {
        #   "manim.animation.animation.Add": [
        #       {... relationship ...}
        #   ]
        # }
        self._api_to_related_apis: dict[
            str, list[dict[str, Any]]
        ] = {}

        # API -> examples using that API
        #
        # Example:
        # {
        #   "manim.mobject.value_tracker.ValueTracker": [
        #       "manim_example_00001"
        #   ]
        # }
        self._api_to_examples: dict[str, list[str]] = {}

        # Example -> APIs used by the example
        #
        # Example:
        # {
        #   "manim_example_00001": [
        #       "manim.mobject.value_tracker.ValueTracker",
        #       ...
        #   ]
        # }
        self._example_to_apis: dict[str, list[str]] = {}

        # Example -> detailed API usage records
        self._example_to_api_usage: dict[
            str, list[dict[str, Any]]
        ] = {}

        # API -> example -> usage records
        #
        # This makes:
        # get_api_usage_in_example(api, example)
        # an O(1)-style dictionary lookup.
        self._api_to_example_usage: dict[
            str, dict[str, list[dict[str, Any]]]
        ] = {}

        self._load()
        self._build_indexes()

    # ======================================================================
    # Loading
    # ======================================================================

    def _load_json(self, path: Path) -> dict[str, Any]:
        if not path.exists():
            raise FileNotFoundError(
                f"Knowledge file not found: {path}"
            )

        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, dict):
            raise ValueError(
                f"Expected JSON object in {path}, "
                f"got {type(data).__name__}"
            )

        return data

    def _load(self) -> None:
        relationships_data = self._load_json(
            self.api_relationships_file
        )

        examples_data = self._load_json(
            self.examples_file
        )

        relationships = relationships_data.get(
            "relationships", []
        )

        examples = examples_data.get(
            "examples", []
        )

        if not isinstance(relationships, list):
            raise ValueError(
                "'relationships' must be a list in "
                "api_relationships.json"
            )

        if not isinstance(examples, list):
            raise ValueError(
                "'examples' must be a list in "
                "examples_with_apis.json"
            )

        self._api_relationships = relationships
        self._examples = examples

    # ======================================================================
    # Index construction
    # ======================================================================

    def _build_indexes(self) -> None:
        self._build_api_relationship_index()
        self._build_example_indexes()

    def _build_api_relationship_index(self) -> None:
        """
        Build API -> related API index.

        We intentionally exclude `has_method` from related APIs.

        Why?

        `has_method` represents:
            Class -> Method

        It is structural ownership rather than an API composition
        relationship.

        For implementation retrieval, the useful relationship types are:
            inherits
            used_with

        We keep the raw relationship records intact so callers can
        still inspect relation type, weight, confidence and evidence.
        """

        for relationship in self._api_relationships:
            if not isinstance(relationship, dict):
                continue

            source = relationship.get("source")
            target = relationship.get("target")
            relation = relationship.get("relation")

            if not source or not target:
                continue

            # `has_method` is structural, not a "related API"
            # composition relationship.
            if relation == "has_method":
                continue

            self._api_to_related_apis.setdefault(
                source, []
            ).append(relationship)

    def _build_example_indexes(self) -> None:
        """
        Build indexes from examples_with_apis.json.

        The file contains:
            id
            title
            code
            api_usage
            apis
            unresolved
            api_count
            ...

        We use the canonical `apis` list for API <-> example
        relationships and preserve `api_usage` separately for
        detailed evidence.
        """

        for example in self._examples:
            if not isinstance(example, dict):
                continue

            example_id = example.get("id")

            if not example_id:
                continue

            apis = example.get("apis", [])

            if not isinstance(apis, list):
                apis = []

            # Remove duplicates while preserving order.
            unique_apis = list(
                dict.fromkeys(
                    api
                    for api in apis
                    if isinstance(api, str) and api
                )
            )

            self._example_to_apis[example_id] = unique_apis

            # --------------------------------------------------------------
            # API -> examples
            # --------------------------------------------------------------

            for api in unique_apis:
                examples = self._api_to_examples.setdefault(
                    api, []
                )

                if example_id not in examples:
                    examples.append(example_id)

            # --------------------------------------------------------------
            # Example -> API usage
            # --------------------------------------------------------------

            api_usage = example.get("api_usage", [])

            if not isinstance(api_usage, list):
                api_usage = []

            valid_usage = [
                usage
                for usage in api_usage
                if isinstance(usage, dict)
            ]

            self._example_to_api_usage[
                example_id
            ] = valid_usage

            # --------------------------------------------------------------
            # API -> Example -> usage
            # --------------------------------------------------------------

            for usage in valid_usage:
                qualified_name = usage.get(
                    "qualified_name"
                )

                if not qualified_name:
                    continue

                self._api_to_example_usage.setdefault(
                    qualified_name, {}
                ).setdefault(
                    example_id, []
                ).append(usage)

    # ======================================================================
    # API relationships
    # ======================================================================

    def get_related_apis(
        self,
        api_qualified_name: str,
        relation_types: set[str] | None = None,
    ) -> list[dict[str, Any]]:
        """
        Return APIs directly related to the given API.

        Default relationship types:
            inherits
            used_with

        Example:
            get_related_apis(
                "manim.mobject.geometry.arc.Dot"
            )
        """

        relationships = self._api_to_related_apis.get(
            api_qualified_name,
            [],
        )

        if relation_types is None:
            return list(relationships)

        return [
            relationship
            for relationship in relationships
            if relationship.get("relation")
            in relation_types
        ]

    # ======================================================================
    # API -> examples
    # ======================================================================

    def get_api_examples(
        self,
        api_qualified_name: str,
    ) -> list[str]:
        """
        Return example IDs that use the given API.
        """

        return list(
            self._api_to_examples.get(
                api_qualified_name,
                [],
            )
        )

    # ======================================================================
    # Example -> APIs
    # ======================================================================

    def get_example_apis(
        self,
        example_id: str,
    ) -> list[str]:
        """
        Return APIs used by an example.
        """

        return list(
            self._example_to_apis.get(
                example_id,
                [],
            )
        )

    # ======================================================================
    # Example -> detailed usage
    # ======================================================================

    def get_example_api_usage(
        self,
        example_id: str,
    ) -> list[dict[str, Any]]:
        """
        Return detailed API usage records for an example.

        Usage records contain information such as:
            qualified_name
            name
            kind
            match_type
            confidence
            usage_type
            line
            object
            class
        """

        return list(
            self._example_to_api_usage.get(
                example_id,
                [],
            )
        )

    # ======================================================================
    # API + Example -> detailed usage
    # ======================================================================

    def get_api_usage_in_example(
        self,
        api_qualified_name: str,
        example_id: str,
    ) -> list[dict[str, Any]]:
        """
        Return all usage records for a specific API inside
        a specific example.
        """

        return list(
            self._api_to_example_usage
            .get(api_qualified_name, {})
            .get(example_id, [])
        )

    # ======================================================================
    # Relationship traversal
    # ======================================================================

    def get_related_api_names(
        self,
        api_qualified_name: str,
        relation_types: set[str] | None = None,
    ) -> list[str]:
        """
        Convenience method returning only qualified API names.
        """

        relationships = self.get_related_apis(
            api_qualified_name,
            relation_types=relation_types,
        )

        return list(
            dict.fromkeys(
                relationship["target"]
                for relationship in relationships
                if relationship.get("target")
            )
        )

    # ======================================================================
    # Statistics / diagnostics
    # ======================================================================

    def health(self) -> dict[str, Any]:
        """
        Return repository statistics useful for startup checks
        and debugging.
        """

        return {
            "status": "ok",
            "manim_version": "0.19.0",
            "relationships": len(
                self._api_relationships
            ),
            "examples": len(
                self._examples
            ),
            "indexed_apis": len(
                self._api_to_related_apis
            ),
            "apis_with_examples": len(
                self._api_to_examples
            ),
            "indexed_examples": len(
                self._example_to_apis
            ),
        }