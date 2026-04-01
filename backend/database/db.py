from fastapi import APIRouter
import os
from dotenv import load_dotenv
from pathlib import Path

# 1. Load the secrets from the .env file (relative to this file's location)
load_dotenv(Path(__file__).parent.parent / ".env")

# We use a Router here so we can include it in the main app
router = APIRouter()


def _resolveSupabaseKey() -> str | None:
    """Support both naming conventions from Supabase docs and existing app code."""
    return os.getenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or os.getenv(
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY"
    )


@router.get("/api/env")
def get_env():
    # Return the keys needed by the frontend Supabase client
    resolvedKey = _resolveSupabaseKey()
    return {
        "NEXT_PUBLIC_SUPABASE_URL": os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": resolvedKey,
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY": resolvedKey,
    }


@router.get("/api/data")
def read_data():
    # Example route
    return {"message": "Here is the secure data", "status": "success"}
