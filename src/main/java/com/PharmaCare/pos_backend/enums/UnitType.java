package com.PharmaCare.pos_backend.model.entity;

public enum UnitType {
    SINGLE("single"),
    STRIP("strip"),
    BOX("box"),
    PAIR("pair"),
    BOTTLE("bottle");

    private final String value;

    UnitType(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public static UnitType fromString(String text) {
        for (UnitType type : UnitType.values()) {
            if (type.value.equalsIgnoreCase(text)) {
                return type;
            }
        }
        throw new IllegalArgumentException("No constant with text " + text + " found");
    }
}