"""HTTP dependency: DB session + 404 helper."""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db, SessionFactory

DbSession = Annotated[Session, Depends(get_db)]
