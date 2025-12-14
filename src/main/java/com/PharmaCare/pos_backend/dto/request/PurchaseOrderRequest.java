package com.PharmaCare.pos_backend.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Data
public class PurchaseOrderRequest {

    private String orderNumber;

    private UUID supplierId;

    private String supplierName;

    @NotNull(message = "Items are required")
    @Size(min = 1, message = "At least one item must be included")
    private List<PurchaseOrderItemRequest> items;

    @NotNull(message = "Subtotal is required")
    @DecimalMin(value = "0.0", inclusive = false, message = "Subtotal must be greater than 0")
    private BigDecimal subtotal;

    @DecimalMin(value = "0.0", message = "Tax cannot be negative")
    private BigDecimal tax;

    @NotNull(message = "Total is required")
    @DecimalMin(value = "0.0", inclusive = false, message = "Total must be greater than 0")
    private BigDecimal total;

    private String notes;

    @NotNull(message = "Created by user ID is required")
    private UUID createdBy;

    @Data
    public static class PurchaseOrderItemRequest {

        private UUID medicineId;

        @NotBlank(message = "Medicine name is required")
        private String medicineName;

        @Min(value = 1, message = "Quantity must be at least 1")
        private int quantity;

        @NotNull(message = "Unit cost is required")
        @DecimalMin(value = "0.0", inclusive = false, message = "Unit cost must be greater than 0")
        private BigDecimal unitCost;

        @NotNull(message = "Total cost is required")
        @DecimalMin(value = "0.0", inclusive = false, message = "Total cost must be greater than 0")
        private BigDecimal totalCost;
    }
}