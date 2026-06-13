import os
from crewai import Agent, Task, Crew
from crewai import LLM
from rag_tools import qdrant_tool

RASSYCODEX_API_BASE = os.getenv("RASSYCODEX_API_BASE", "http://host.docker.internal:8844/v1")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", RASSYCODEX_API_BASE)
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", os.getenv("RASSYCODEX_CODER_MODEL", "rassy-codex"))
RASSYCODEX_API_KEY = os.getenv("RASSYCODEX_API_KEY") or os.getenv("OPENAI_API_KEY", "")

ollama_llm = LLM(
    model=OLLAMA_MODEL,
    base_url=OLLAMA_BASE_URL,
    api_key=RASSYCODEX_API_KEY,
)

coder_with_memory = Agent(
    role="System architect & code implementer",
    goal=(
        "Design and implement robust systems on the user's desktop, using RAG "
        "over stored knowledge when helpful."
    ),
    backstory=(
        "You are a senior engineer who uses a vector database (Qdrant) as long-term "
        "memory. You query it whenever context might help you design or write code."
    ),
    llm=ollama_llm,
    tools=[qdrant_tool],
    allow_code_execution=True,
    code_execution_mode="safe",   # will use Docker via CrewAI tools
)

task = Task(
    description=(
        "User wants help designing and implementing a system (in code) on their "
        "desktop. First, search the Qdrant knowledge base for any relevant context, "
        "then propose an architecture and produce concrete code changes or files."
    ),
    agent=coder_with_memory,
    expected_output=(
        "A clear, step-by-step architecture plus concrete code snippets or files "
        "ready to run."
    ),
)

crew = Crew(
    agents=[coder_with_memory],
    tasks=[task],
)

if __name__ == "__main__":
    result = crew.kickoff()
    print(result)
