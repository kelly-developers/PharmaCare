package com.PharmaCare.pos_backend.util;

import com.PharmaCare.pos_backend.model.entity.Medicine;
import com.PharmaCare.pos_backend.model.entity.MedicineUnit;

import java.math.BigDecimal;

public class StockCalculator {

    private StockCalculator() {
        // Utility class, no instantiation
    }

    public static BigDecimal calculateStockValue(Medicine medicine) {
        if (medicine == null || medicine.getStockQuantity() == 0) {
            return BigDecimal.ZERO;
        }

        return medicine.getCostPrice().multiply(BigDecimal.valueOf(medicine.getStockQuantity()));
    }

    public static int calculateEquivalentUnits(Medicine medicine, String fromUnitType, String toUnitType, int quantity) {
        MedicineUnit fromUnit = findUnitByType(medicine, fromUnitType);
        MedicineUnit toUnit = findUnitByType(medicine, toUnitType);

        if (fromUnit == null || toUnit == null) {
            throw new IllegalArgumentException("Invalid unit types");
        }

        int baseQuantity = quantity * fromUnit.getQuantity();
        return baseQuantity / toUnit.getQuantity();
    }

    public static BigDecimal calculateSellingPrice(Medicine medicine, String unitType, int quantity) {
        MedicineUnit unit = findUnitByType(medicine, unitType);

        if (unit == null) {
            throw new IllegalArgumentException("Invalid unit type");
        }

        return unit.getPrice().multiply(BigDecimal.valueOf(quantity));
    }

    public static boolean isLowStock(Medicine medicine) {
        return medicine.getStockQuantity() <= medicine.getReorderLevel();
    }

    public static boolean isOutOfStock(Medicine medicine) {
        return medicine.getStockQuantity() == 0;
    }

    public static boolean isExpiringSoon(Medicine medicine, int daysThreshold) {
        return medicine.getExpiryDate().isBefore(java.time.LocalDate.now().plusDays(daysThreshold));
    }

    public static int calculateReorderQuantity(Medicine medicine, int daysOfSupply) {
        // Simplified calculation - in reality would consider sales history
        int averageDailySales = 10; // This should come from historical data
        return averageDailySales * daysOfSupply;
    }

    private static MedicineUnit findUnitByType(Medicine medicine, String unitType) {
        return medicine.getUnits().stream()
                .filter(unit -> unit.getType().getValue().equalsIgnoreCase(unitType))
                .findFirst()
                .orElse(null);
    }
}