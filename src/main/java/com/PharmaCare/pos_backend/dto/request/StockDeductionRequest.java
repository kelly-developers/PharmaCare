package com.PharmaCare.pos_backend.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class StockDeductionRequest {

    @Min(value = 1, message = "Quantity must be at least 1")
    private int quantity;

    @NotBlank(message = "Unit type is required")
    private String unitType;

    private String referenceId; // String, not UUID

    @NotBlank(message = "Performed by is required")
    private String performedById; // String, not UUID

    @NotBlank(message = "Role is required")
    private String role;
}