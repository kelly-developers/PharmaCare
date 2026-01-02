package com.PharmaCare.pos_backend.enums.converter;

import com.PharmaCare.pos_backend.enums.UnitType;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class UnitTypeConverter implements AttributeConverter<UnitType, String> {

    @Override
    public String convertToDatabaseColumn(UnitType unitType) {
        if (unitType == null) {
            return UnitType.OTHER.name();
        }
        return unitType.name(); // Store as uppercase string
    }

    @Override
    public UnitType convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.trim().isEmpty()) {
            return UnitType.OTHER;
        }
        try {
            return UnitType.fromString(dbData);
        } catch (Exception e) {
            return UnitType.OTHER;
        }
    }
}