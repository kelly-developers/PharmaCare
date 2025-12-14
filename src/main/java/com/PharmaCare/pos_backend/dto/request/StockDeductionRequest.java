package com.PharmaCare.pos_backend.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class StockDeductionRequest {

    @Min(value = 1, message = "Quantity must be at least 1")
    private int quantity;

    @NotBlank(message = "Unit type is required")
    private String unitType;

    @NotNull(message = "Reference ID is required")
    private UUID referenceId;

    @NotNull(message = "Performed by user ID is required")
    private UUID performedBy;

    @NotBlank(message = "Performer role is required")
    private String performedByRole;
}