package com.PharmaCare.pos_backend.enums;

import lombok.Getter;

@Getter
public enum UnitType {
    SINGLE("single", "Single"),
    STRIP("strip", "Strip"),
    BOX("box", "Box"),
    PAIR("pair", "Pair"),
    BOTTLE("bottle", "Bottle"),
    TABLETS("tablets", "Tablets"),
    SYRUP("syrup", "Syrup"),
    INJECTION("injection", "Injection"),
    CREAM("cream", "Cream"),
    DROPS("drops", "Drops"),
    POWDER("powder", "Powder"),
    DEVICE("device", "Device"),
    CONSUMABLE("consumable", "Consumable"),
    SERVICE("service", "Service"),
    OTHER("other", "Other"),
    PIECE("piece", "Piece"),
    PACK("pack", "Pack"),
    VIAL("vial", "Vial");

    private final String value;
    private final String description;

    UnitType(String value, String description) {
        this.value = value;
        this.description = description;
    }

    public static UnitType fromString(String text) {
        if (text == null || text.trim().isEmpty()) {
            return OTHER;
        }

        String input = text.trim().toLowerCase();

        // First try exact match
        for (UnitType type : UnitType.values()) {
            if (type.value.equalsIgnoreCase(input)) {
                return type;
            }
        }

        // Handle common variations and synonyms
        switch (input) {
            case "tablet":
            case "tab":
            case "tabs":
            case "pills":
            case "capsule":
            case "capsules":
                return TABLETS;
            case "strips":
                return STRIP;
            case "boxes":
                return BOX;
            case "bottles":
                return BOTTLE;
            case "pairs":
                return PAIR;
            case "injections":
            case "ampoule":
            case "ampoules":
            case "vial":
            case "vials":
                return INJECTION;
            case "creams":
            case "ointment":
            case "ointments":
                return CREAM;
            case "drop":
                return DROPS;
            case "powders":
                return POWDER;
            case "devices":
            case "equipment":
                return DEVICE;
            case "consumables":
            case "supplies":
                return CONSUMABLE;
            case "services":
                return SERVICE;
            case "pieces":
                return PIECE;
            case "packs":
            case "packet":
            case "packets":
                return PACK;
            case "syrups":
            case "liquid":
            case "liquids":
                return SYRUP;
            default:
                // Instead of throwing exception, return OTHER and log warning
                System.err.println("Warning: Unknown unit type: '" + text + "'. Defaulting to OTHER.");
                return OTHER;
        }
    }

    public static String getAvailableTypes() {
        StringBuilder sb = new StringBuilder();
        for (UnitType type : UnitType.values()) {
            sb.append(type.value).append(" (").append(type.description).append("), ");
        }
        // Remove the last comma and space
        if (sb.length() > 0) {
            sb.setLength(sb.length() - 2);
        }
        return sb.toString();
    }

    @Override
    public String toString() {
        return value;
    }

    // Add this method for JPA enum conversion
    public String getValue() {
        return value;
    }
}