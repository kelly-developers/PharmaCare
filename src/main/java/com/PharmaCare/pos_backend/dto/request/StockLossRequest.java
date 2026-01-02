package com.PharmaCare.pos_backend.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class StockLossRequest {

    @NotNull(message = "Medicine ID is required")
    private UUID medicineId;

    @Min(value = 1, message = "Quantity must be at least 1")
    private int quantity;

    @NotBlank(message = "Reason is required")
    private String reason;

    @NotNull(message = "Performed by user ID is required")
    private String performedBy;

    @NotNull(message = "Performer role is required")
    private String performedByRole;
}