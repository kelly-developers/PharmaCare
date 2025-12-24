package com.PharmaCare.pos_backend.dto.request;

import com.PharmaCare.pos_backend.enums.PaymentMethod;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Data
public class SaleRequest {

    @NotNull(message = "Items are required")
    @Size(min = 1, message = "At least one item must be included in the sale")
    private List<SaleItemRequest> items;

    @NotNull(message = "Subtotal is required")
    @DecimalMin(value = "0.0", inclusive = false, message = "Subtotal must be greater than 0")
    private BigDecimal subtotal;

    @DecimalMin(value = "0.0", message = "Discount cannot be negative")
    private BigDecimal discount;

    @DecimalMin(value = "0.0", message = "Tax cannot be negative")
    private BigDecimal tax;

    @NotNull(message = "Total is required")
    @DecimalMin(value = "0.0", inclusive = false, message = "Total must be greater than 0")
    private BigDecimal total;

    @NotNull(message = "Payment method is required")
    private PaymentMethod paymentMethod;

    @NotNull(message = "Cashier ID is required")
    private UUID cashierId;

    @NotBlank(message = "Cashier name is required")
    private String cashierName;

    private String customerName;
    private String customerPhone;

    @Data
    public static class SaleItemRequest {

        @NotNull(message = "Medicine ID is required")
        private UUID medicineId;

        @NotBlank(message = "Medicine name is required")
        private String medicineName;

        @NotBlank(message = "Unit type is required")
        private String unitType;

        @Min(value = 1, message = "Quantity must be at least 1")
        private int quantity;

        @NotNull(message = "Unit price is required")
        @DecimalMin(value = "0.0", inclusive = false, message = "Unit price must be greater than 0")
        private BigDecimal unitPrice;

        @NotNull(message = "Total price is required")
        @DecimalMin(value = "0.0", inclusive = false, message = "Total price must be greater than 0")
        private BigDecimal totalPrice;

        @DecimalMin(value = "0.0", message = "Cost price cannot be negative")
        private BigDecimal costPrice;
    }
}