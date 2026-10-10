"""Aggregate and register all API routers."""
from fastapi import APIRouter

from .projects import router as _projects_router  # noqa: F401
from .segments import router as _segments_router  # noqa: F401
from .publish import router as _publish_router  # noqa: F401
from .runtime import router as _runtime_router  # noqa: F401
from .translate import router as _translate_router  # noqa: F401

api_router = APIRouter()
api_router.include_router(_projects_router)
api_router.include_router(_segments_router)
api_router.include_router(_publish_router)
api_router.include_router(_runtime_router)
api_router.include_router(_translate_router)
