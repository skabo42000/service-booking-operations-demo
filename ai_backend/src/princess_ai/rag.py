"""Isti mali in-memory RAG obrazac kao synq-ai-squad, nad potvrđenim činjenicama."""

from pathlib import Path
import sys

from dotenv import load_dotenv
from langchain_core.documents import Document
from langchain_core.vectorstores import InMemoryVectorStore
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter

ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = ROOT.parent
DOCS_DIR = ROOT / "docs"
STORE_FILE = ROOT / "vector_store.json"
load_dotenv(PROJECT_ROOT / ".env.local")


def embeddings() -> GoogleGenerativeAIEmbeddings:
    return GoogleGenerativeAIEmbeddings(model="gemini-embedding-2")


def load_and_split() -> list[Document]:
    headings = MarkdownHeaderTextSplitter(headers_to_split_on=[("#", "title"), ("##", "section")], strip_headers=False)
    size = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)
    chunks: list[Document] = []
    for path in sorted(DOCS_DIR.glob("*.md")):
        for chunk in size.split_documents(headings.split_text(path.read_text(encoding="utf-8"))):
            chunk.metadata["source"] = path.name
            if "section" in chunk.metadata:
                chunk.page_content = f"# {chunk.metadata.get('title', 'Studio Princess')}\n{chunk.page_content}"
            chunks.append(chunk)
    return chunks


def ingest() -> None:
    chunks = load_and_split()
    if not chunks:
        raise RuntimeError("Nema potvrđenih izvora za AI vodič.")
    store = InMemoryVectorStore(embeddings())
    store.add_documents(chunks)
    store.dump(str(STORE_FILE))
    print(f"Sačuvano {len(chunks)} odjeljaka iz {len(list(DOCS_DIR.glob('*.md')))} dokumenta.")


def get_store() -> InMemoryVectorStore:
    if not STORE_FILE.exists():
        ingest()
    return InMemoryVectorStore.load(str(STORE_FILE), embeddings())


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    ingest()
