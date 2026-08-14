"""Internal API schemas and validated NEIS response fragments."""

from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class ErrorResponse(ApiModel):
    code: str
    message: str
    field: str | None = None
    request_id: str = Field(serialization_alias="requestId")


class HealthResponse(BaseModel):
    status: str = "ok"


class School(ApiModel):
    office_code: str = Field(serialization_alias="officeCode")
    school_code: str = Field(serialization_alias="schoolCode")
    name: str
    school_type: str | None = Field(default=None, serialization_alias="schoolType")
    location: str | None = None
    address: str | None = None


class Meal(ApiModel):
    date: date
    meal_type: str = Field(serialization_alias="mealType")
    menu: str
    calories: str | None = None
    nutrition: str | None = None
    origin: str | None = None


class NeisSchoolRow(BaseModel):
    office_code: str = Field(validation_alias="ATPT_OFCDC_SC_CODE", min_length=1)
    school_code: str = Field(validation_alias="SD_SCHUL_CODE", min_length=1)
    name: str = Field(validation_alias="SCHUL_NM", min_length=1)
    school_type: str | None = Field(default=None, validation_alias="SCHUL_KND_SC_NM")
    location: str | None = Field(default=None, validation_alias="LCTN_SC_NM")
    address: str | None = Field(default=None, validation_alias="ORG_RDNMA")

    def to_school(self) -> School:
        return School(
            office_code=self.office_code,
            school_code=self.school_code,
            name=self.name,
            school_type=self.school_type,
            location=self.location,
            address=self.address,
        )


class NeisMealRow(BaseModel):
    office_code: str = Field(validation_alias="ATPT_OFCDC_SC_CODE", min_length=1)
    school_code: str = Field(validation_alias="SD_SCHUL_CODE", min_length=1)
    meal_code: str = Field(validation_alias="MMEAL_SC_CODE", min_length=1)
    meal_type: str = Field(validation_alias="MMEAL_SC_NM", min_length=1)
    meal_date: date = Field(validation_alias="MLSV_YMD")
    menu: str = Field(validation_alias="DDISH_NM", min_length=1)
    calories: str | None = Field(default=None, validation_alias="CAL_INFO")
    nutrition: str | None = Field(default=None, validation_alias="NTR_INFO")
    origin: str | None = Field(default=None, validation_alias="ORPLC_INFO")

    @field_validator("meal_date", mode="before")
    @classmethod
    def parse_neis_date(cls, value: Any) -> date:
        if not isinstance(value, str) or len(value) != 8 or not value.isdigit():
            raise ValueError("must be a YYYYMMDD date")
        return date.fromisoformat(f"{value[:4]}-{value[4:6]}-{value[6:]}")
