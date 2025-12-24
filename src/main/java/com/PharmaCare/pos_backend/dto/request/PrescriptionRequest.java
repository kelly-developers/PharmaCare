package com.PharmaCare.pos_backend.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

@Data
public class PrescriptionRequest {

    @NotBlank(message = "Patient name is required")
    @Size(max = 255, message = "Patient name must not exceed 255 characters")
    private String patientName;

    @Size(max = 50, message = "Patient phone must not exceed 50 characters")
    private String patientPhone;

    @Size(max = 1000, message = "Diagnosis must not exceed 1000 characters")
    private String diagnosis;

    @Size(max = 1000, message = "Notes must not exceed 1000 characters")
    private String notes;

    @NotNull(message = "Items are required")
    @Size(min = 1, message = "At least one prescription item is required")
    private List<PrescriptionItemRequest> items;

    // REMOVED: createdBy field - should come from authentication, not request

    @Data
    public static class PrescriptionItemRequest {

        @NotBlank(message = "Medicine name is required")
        @Size(max = 255, message = "Medicine name must not exceed 255 characters")
        private String medicine;

        @Size(max = 100, message = "Dosage must not exceed 100 characters")
        private String dosage;

        @Size(max = 100, message = "Frequency must not exceed 100 characters")
        private String frequency;

        @Size(max = 100, message = "Duration must not exceed 100 characters")
        private String duration;

        @Size(max = 500, message = "Instructions must not exceed 500 characters")
        private String instructions;
    }
}