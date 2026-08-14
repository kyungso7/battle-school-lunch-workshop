from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.main_types import RequestInputError
from app.neis_client import NeisClient
from app.schemas import School

router = APIRouter(prefix="/api", tags=["schools"])


def get_neis_client(request: Request) -> NeisClient:
    return request.app.state.neis_client


@router.get(
    "/schools",
    response_model=list[School],
    response_model_exclude_none=True,
)
async def search_schools(
    query: Annotated[str, Query(min_length=1)],
    client: Annotated[NeisClient, Depends(get_neis_client)],
) -> list[School]:
    cleaned_query = query.strip()
    if not cleaned_query:
        raise RequestInputError("query", "School query must not be blank.")
    return await client.search_schools(cleaned_query)
