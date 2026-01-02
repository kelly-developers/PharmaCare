package com.PharmaCare.pos_backend.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Data
public class MedicineRequest {

    @NotBlank(message = "Medicine name is required")
    @Size(max = 255, message = "Medicine name must not exceed 255 characters")
    private String name;

    private String genericName;

    @NotBlank(message = "Category is required")
    private String category;

    private String manufacturer; // Made optional - removed @NotBlank

    private String batchNumber; // Made optional - removed @NotBlank

    @Future(message = "Expiry date must be in the future if provided")
    private LocalDate expiryDate; // Made optional - removed @NotNull

    @NotNull(message = "Units are required")
    @Size(min = 1, message = "At least one unit type must be specified")
    private List<UnitRequest> units;

    @Min(value = 0, message = "Stock quantity cannot be negative")
    private int stockQuantity;

    @Min(value = 0, message = "Reorder level cannot be negative")
    private int reorderLevel;

    private UUID supplierId;

    @NotNull(message = "Cost price is required")
    @DecimalMin(value = "0.0", inclusive = false, message = "Cost price must be greater than 0")
    private BigDecimal costPrice;

    private String imageUrl;

    private String description;

    private String productType; // Added for product type

    @Data
    public static class UnitRequest {

        @NotBlank(message = "Unit type is required")
        private String type;

        @Min(value = 1, message = "Quantity must be at least 1")
        private int quantity;

        @NotNull(message = "Price is required")
        @DecimalMin(value = "0.0", inclusive = false, message = "Price must be greater than 0")
        private BigDecimal price;
    }
}