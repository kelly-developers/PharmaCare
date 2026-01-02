package com.PharmaCare.pos_backend.enums;

import com.fasterxml.jackson.annotation.JsonValue;

public enum Role {
    ADMIN,
    MANAGER,
    PHARMACIST,
    CASHIER;

    @JsonValue
    public String getValue() {
        return this.name().toLowerCase();
    }
}