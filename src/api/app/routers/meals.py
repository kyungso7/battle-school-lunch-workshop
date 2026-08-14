from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.main_types import RequestInputError
from app.neis_client import NeisClient
from app.routers.schools import get_neis_client
from app.schemas import Meal

router = APIRouter(prefix="/api", tags=["meals"])


@router.get(
    "/meals",
    response_model=list[Meal],
    response_model_exclude_none=True,
)
async def get_meals(
    office_code: Annotated[str, Query(alias="officeCode", min_length=1)],
    school_code: Annotated[str, Query(alias="schoolCode", min_length=1)],
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
    client: Annotated[NeisClient, Depends(get_neis_client)],
) -> list[Meal]:
    if not office_code.strip():
        raise RequestInputError("officeCode", "Office code must not be blank.")
    if not school_code.strip():
        raise RequestInputError("schoolCode", "School code must not be blank.")
    if from_date > to_date:
        raise RequestInputError("to", "End date must be on or after start date.")
    if (to_date - from_date).days + 1 > 31:
        raise RequestInputError("to", "Date range must not exceed 31 days.")
    return await client.get_meals(
        office_code.strip(), school_code.strip(), from_date, to_date
    )
