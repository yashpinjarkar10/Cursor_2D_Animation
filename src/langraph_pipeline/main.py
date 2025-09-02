from config import setup_environment, initialize_services
from state import create_initial_state
from pipeline import create_pipeline

def main():
    """Main execution function."""
    # Setup environment
    setup_environment()
    
    # Initialize services
    llm, search_tool, supabase = initialize_services()
    
    # Create pipeline
    graph = create_pipeline(llm, search_tool, supabase)
    
    # Run pipeline
    input_state = create_initial_state("neural network")
    result = graph.invoke(input_state)
    
    # Print results
    print("Result:", result)
    print("\nGenerated Code:")
    print(result.get('code', 'No code generated'))

if __name__ == "__main__":
    main()