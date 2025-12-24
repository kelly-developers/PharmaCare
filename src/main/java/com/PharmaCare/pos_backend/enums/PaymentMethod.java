package com.PharmaCare.pos_backend.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum PaymentMethod {
    CASH,
    MPESA,
    CARD;

    @JsonCreator
    public static PaymentMethod fromString(String value) {
        if (value == null) {
            return null;
        }
        try {
            // Accept both uppercase and lowercase
            return PaymentMethod.valueOf(value.toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    @JsonValue
    public String toValue() {
        return this.name();
    }
}