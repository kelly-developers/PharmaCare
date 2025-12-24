package com.PharmaCare.pos_backend.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@AllArgsConstructor
@NoArgsConstructor
@Data
public class StockAdditionRequest {

    @NotNull(message = "Medicine ID is required")
    private UUID medicineId;

    @Min(value = 1, message = "Quantity must be at least 1")
    private int quantity;

    @NotNull(message = "Reference ID is required")
    private String referenceId;;

    @NotNull(message = "Performed by user ID is required")
    private String performedBy;

    @NotNull(message = "Performer role is required")
    private String performedByRole;
}