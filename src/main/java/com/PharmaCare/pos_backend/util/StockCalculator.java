package com.PharmaCare.pos_backend.util;

import com.PharmaCare.pos_backend.enums.UnitType;
import com.PharmaCare.pos_backend.model.Medicine;
import com.PharmaCare.pos_backend.model.MedicineUnit;
import lombok.extern.slf4j.Slf4j;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Optional;

@Slf4j
public class StockCalculator {

    private StockCalculator() {
        // Utility class, no instantiation
    }

    /**
     * Calculate stock value - uses cost price by default
     */
    public static BigDecimal calculateStockValue(Medicine medicine) {
        return calculateCostStockValue(medicine);
    }

    /**
     * Calculate STOCK VALUE based on COST PRICE
     */
    public static BigDecimal calculateCostStockValue(Medicine medicine) {
        try {
            if (medicine == null || medicine.getStockQuantity() == 0 || medicine.getCostPrice() == null) {
                return BigDecimal.ZERO;
            }

            BigDecimal costPerTablet = calculateCostPerTablet(medicine);
            BigDecimal value = costPerTablet.multiply(BigDecimal.valueOf(medicine.getStockQuantity()));
            return value.setScale(2, RoundingMode.HALF_UP);

        } catch (Exception e) {
            log.error("Error calculating cost stock value for medicine {}: {}",
                    medicine != null ? medicine.getName() : "null", e.getMessage());
            return BigDecimal.ZERO;
        }
    }

    /**
     * Calculate SELLING VALUE based on SELLING PRICE
     */
    public static BigDecimal calculateSellingStockValue(Medicine medicine) {
        try {
            if (medicine == null || medicine.getStockQuantity() == 0) {
                return BigDecimal.ZERO;
            }

            BigDecimal sellingPricePerTablet = getSellingPricePerTablet(medicine);

            if (sellingPricePerTablet.compareTo(BigDecimal.ZERO) <= 0) {
                BigDecimal costPerTablet = calculateCostPerTablet(medicine);
                sellingPricePerTablet = costPerTablet.multiply(new BigDecimal("1.3"));
            }

            BigDecimal value = sellingPricePerTablet.multiply(BigDecimal.valueOf(medicine.getStockQuantity()));
            return value.setScale(2, RoundingMode.HALF_UP);

        } catch (Exception e) {
            log.error("Error calculating selling stock value for medicine {}: {}",
                    medicine != null ? medicine.getName() : "null", e.getMessage());
            return BigDecimal.ZERO;
        }
    }

    /**
     * Get selling price per tablet
     */
    public static BigDecimal getSellingPricePerTablet(Medicine medicine) {
        try {
            if (medicine == null || medicine.getUnits() == null || medicine.getUnits().isEmpty()) {
                return BigDecimal.ZERO;
            }

            List<MedicineUnit> units = medicine.getUnits();

            Optional<MedicineUnit> tabletUnit = units.stream()
                    .filter(unit -> unit != null && unit.getType() != null &&
                            (unit.getType() == UnitType.SINGLE || unit.getType() == UnitType.TABLETS))
                    .findFirst();

            if (tabletUnit.isPresent()) {
                MedicineUnit unit = tabletUnit.get();
                if (unit.getPrice() != null && unit.getQuantity() != null && unit.getQuantity() > 0) {
                    return unit.getPrice()
                            .divide(BigDecimal.valueOf(unit.getQuantity()), 4, RoundingMode.HALF_UP);
                }
            }

            Optional<MedicineUnit> anyUnit = units.stream()
                    .filter(unit -> unit != null && unit.getPrice() != null &&
                            unit.getPrice().compareTo(BigDecimal.ZERO) > 0 &&
                            unit.getQuantity() != null && unit.getQuantity() > 0)
                    .findFirst();

            if (anyUnit.isPresent()) {
                MedicineUnit unit = anyUnit.get();
                return unit.getPrice()
                        .divide(BigDecimal.valueOf(unit.getQuantity()), 4, RoundingMode.HALF_UP);
            }

            return BigDecimal.ZERO;
        } catch (Exception e) {
            log.error("Error getting selling price per tablet for medicine {}: {}",
                    medicine != null ? medicine.getName() : "null", e.getMessage());
            return BigDecimal.ZERO;
        }
    }

    /**
     * FIXED: Calculate cost per tablet correctly
     */
    public static BigDecimal calculateCostPerTablet(Medicine medicine) {
        try {
            if (medicine == null || medicine.getCostPrice() == null) {
                return BigDecimal.ZERO;
            }

            int tabletsPerBox = getTabletsPerBox(medicine);
            if (tabletsPerBox == 0) {
                tabletsPerBox = 100; // Default
            }

            return medicine.getCostPrice()
                    .divide(BigDecimal.valueOf(tabletsPerBox), 4, RoundingMode.HALF_UP)
                    .setScale(4, RoundingMode.HALF_UP);
        } catch (Exception e) {
            log.error("Error calculating cost per tablet for medicine {}: {}",
                    medicine != null ? medicine.getName() : "null", e.getMessage());
            return BigDecimal.ZERO;
        }
    }

    /**
     * Get tablets per box
     */
    public static int getTabletsPerBox(Medicine medicine) {
        try {
            if (medicine == null || medicine.getUnits() == null) {
                return 100; // Default
            }

            return medicine.getUnits().stream()
                    .filter(unit -> unit != null && unit.getType() != null && unit.getType() == UnitType.BOX)
                    .findFirst()
                    .map(MedicineUnit::getQuantity)
                    .orElse(100); // Default
        } catch (Exception e) {
            log.error("Error getting tablets per box for medicine {}: {}",
                    medicine != null ? medicine.getName() : "null", e.getMessage());
            return 100;
        }
    }

    /**
     * Get tablets per strip
     */
    public static int getTabletsPerStrip(Medicine medicine) {
        try {
            if (medicine == null || medicine.getUnits() == null) {
                return 10; // Default
            }

            return medicine.getUnits().stream()
                    .filter(unit -> unit != null && unit.getType() != null && unit.getType() == UnitType.STRIP)
                    .findFirst()
                    .map(MedicineUnit::getQuantity)
                    .orElse(10); // Default
        } catch (Exception e) {
            log.error("Error getting tablets per strip for medicine {}: {}",
                    medicine != null ? medicine.getName() : "null", e.getMessage());
            return 10;
        }
    }

    /**
     * Calculate profit for a sale item
     */
    public static BigDecimal calculateItemProfit(BigDecimal sellingPrice, Medicine medicine, int quantity, String unitType) {
        try {
            BigDecimal costPerUnit = calculateCostPerUnit(medicine);
            int quantityInSmallestUnits = convertToSmallestUnits(medicine, quantity, unitType);
            BigDecimal totalCost = costPerUnit.multiply(BigDecimal.valueOf(quantityInSmallestUnits));
            return sellingPrice.subtract(totalCost).setScale(2, RoundingMode.HALF_UP);
        } catch (Exception e) {
            log.error("Error calculating item profit for medicine {}: {}",
                    medicine != null ? medicine.getName() : "null", e.getMessage());
            return BigDecimal.ZERO;
        }
    }

    /**
     * Calculate total selling price for a quantity
     */
    public static BigDecimal calculateTotalSellingPrice(Medicine medicine, int quantity, String unitType) {
        try {
            BigDecimal sellingPricePerTablet = getSellingPricePerTablet(medicine);
            int quantityInSmallestUnits = convertToSmallestUnits(medicine, quantity, unitType);
            return sellingPricePerTablet.multiply(BigDecimal.valueOf(quantityInSmallestUnits))
                    .setScale(2, RoundingMode.HALF_UP);
        } catch (Exception e) {
            log.error("Error calculating total selling price for medicine {}: {}",
                    medicine != null ? medicine.getName() : "null", e.getMessage());
            return BigDecimal.ZERO;
        }
    }

    /**
     * Calculate total cost price for a quantity
     */
    public static BigDecimal calculateTotalCostPrice(Medicine medicine, int quantity, String unitType) {
        try {
            BigDecimal costPerUnit = calculateCostPerUnit(medicine);
            int quantityInSmallestUnits = convertToSmallestUnits(medicine, quantity, unitType);
            return costPerUnit.multiply(BigDecimal.valueOf(quantityInSmallestUnits))
                    .setScale(2, RoundingMode.HALF_UP);
        } catch (Exception e) {
            log.error("Error calculating total cost price for medicine {}: {}",
                    medicine != null ? medicine.getName() : "null", e.getMessage());
            return BigDecimal.ZERO;
        }
    }

    /**
     * FIXED: Convert any unit to smallest units CORRECTLY
     */
    public static int convertToSmallestUnits(Medicine medicine, int quantity, String unitType) {
        try {
            if (medicine == null) {
                return quantity;
            }

            String unitLower = unitType.toLowerCase().trim();
            log.debug("Converting {} {} to tablets for: {}", quantity, unitType, medicine.getName());

            // Single units - 1:1 ratio
            if (isSingleUnit(unitLower)) {
                return quantity;
            }

            // Check medicine units
            List<MedicineUnit> units = medicine.getUnits();
            if (units != null) {
                for (MedicineUnit unit : units) {
                    if (unit != null && unit.getType() != null) {
                        String unitValue = unit.getType().getValue().toLowerCase();
                        if (unitValue.equals(unitLower)) {
                            if (unit.getQuantity() > 0) {
                                return quantity * unit.getQuantity();
                            }
                        }
                    }
                }
            }

            // Default conversions
            return getDefaultTablets(unitLower, quantity);

        } catch (Exception e) {
            log.error("Error converting to smallest units for medicine {}: {}",
                    medicine != null ? medicine.getName() : "null", e.getMessage());
            return quantity; // Safe fallback
        }
    }

    private static boolean isSingleUnit(String unitType) {
        return unitType.equals("tablet") || unitType.equals("tablets") ||
                unitType.equals("tab") || unitType.equals("tabs") ||
                unitType.equals("pill") || unitType.equals("pills") ||
                unitType.equals("capsule") || unitType.equals("capsules") ||
                unitType.equals("unit") || unitType.equals("units") ||
                unitType.equals("single") || unitType.equals("singles") ||
                unitType.equals("piece") || unitType.equals("pieces") ||
                unitType.equals("each") || unitType.equals("item") || unitType.equals("items");
    }

    private static int getDefaultTablets(String unitType, int quantity) {
        switch (unitType) {
            case "strip":
            case "strips":
                return quantity * 10;
            case "box":
            case "boxes":
                return quantity * 100;
            case "pack":
            case "packs":
                return quantity * 30;
            case "bottle":
            case "bottles":
                return quantity;
            case "vial":
            case "vials":
                return quantity;
            default:
                log.warn("Unknown unit type: {}, treating as single", unitType);
                return quantity;
        }
    }

    /**
     * Find unit by type
     */
    public static MedicineUnit findUnitByType(Medicine medicine, String unitType) {
        try {
            if (medicine == null || medicine.getUnits() == null || unitType == null || unitType.trim().isEmpty()) {
                return null;
            }

            UnitType targetType = UnitType.fromString(unitType.trim());

            return medicine.getUnits().stream()
                    .filter(unit -> unit != null && unit.getType() != null && unit.getType() == targetType)
                    .findFirst()
                    .orElse(null);
        } catch (Exception e) {
            log.warn("Could not find unit type '{}' for medicine {}: {}",
                    unitType, medicine != null ? medicine.getName() : "null", e.getMessage());
            return null;
        }
    }

    /**
     * Calculate cost per unit (tablet/ml/gram/etc.)
     */
    public static BigDecimal calculateCostPerUnit(Medicine medicine) {
        try {
            if (medicine == null || medicine.getCostPrice() == null) {
                return BigDecimal.ZERO;
            }

            int totalSmallestUnits = getTotalSmallestUnits(medicine);
            if (totalSmallestUnits <= 0) {
                return calculateCostPerTablet(medicine);
            }

            return medicine.getCostPrice()
                    .divide(BigDecimal.valueOf(totalSmallestUnits), 4, RoundingMode.HALF_UP)
                    .setScale(4, RoundingMode.HALF_UP);
        } catch (Exception e) {
            log.error("Error calculating cost per unit for medicine {}: {}",
                    medicine != null ? medicine.getName() : "null", e.getMessage());
            return calculateCostPerTablet(medicine);
        }
    }

    /**
     * Get total quantity in smallest units
     */
    private static int getTotalSmallestUnits(Medicine medicine) {
        try {
            if (medicine == null) {
                return 0;
            }
            return medicine.getStockQuantity();
        } catch (Exception e) {
            log.error("Error getting total smallest units for medicine {}: {}",
                    medicine != null ? medicine.getName() : "null", e.getMessage());
            return 0;
        }
    }

    /**
     * Convert total tablets to tabs/strips/boxes breakdown
     */
    public static int[] convertToBreakdown(Medicine medicine, int totalTablets) {
        try {
            if (medicine == null || totalTablets <= 0) {
                return new int[]{0, 0, 0};
            }

            int tabletsPerBox = getTabletsPerBox(medicine);
            int tabletsPerStrip = getTabletsPerStrip(medicine);

            int boxes = totalTablets / tabletsPerBox;
            int remainingAfterBoxes = totalTablets % tabletsPerBox;
            int strips = remainingAfterBoxes / tabletsPerStrip;
            int tabs = remainingAfterBoxes % tabletsPerStrip;

            return new int[]{tabs, strips, boxes};
        } catch (Exception e) {
            log.error("Error converting to breakdown for medicine {}: {}",
                    medicine != null ? medicine.getName() : "null", e.getMessage());
            return new int[]{totalTablets, 0, 0};
        }
    }

    /**
     * Check if stock is low
     */
    public static boolean isLowStock(Medicine medicine) {
        try {
            return medicine != null && medicine.getStockQuantity() <= medicine.getReorderLevel();
        } catch (Exception e) {
            log.error("Error checking low stock for medicine {}: {}",
                    medicine != null ? medicine.getName() : "null", e.getMessage());
            return false;
        }
    }

    /**
     * Check if stock is out
     */
    public static boolean isOutOfStock(Medicine medicine) {
        try {
            return medicine != null && medicine.getStockQuantity() == 0;
        } catch (Exception e) {
            log.error("Error checking out of stock for medicine {}: {}",
                    medicine != null ? medicine.getName() : "null", e.getMessage());
            return true;
        }
    }

    /**
     * Check if medicine is expiring soon
     */
    public static boolean isExpiringSoon(Medicine medicine, int daysThreshold) {
        try {
            return medicine != null &&
                    medicine.getExpiryDate() != null &&
                    medicine.getExpiryDate().isBefore(java.time.LocalDate.now().plusDays(daysThreshold));
        } catch (Exception e) {
            log.error("Error checking expiry for medicine {}: {}",
                    medicine != null ? medicine.getName() : "null", e.getMessage());
            return false;
        }
    }
}