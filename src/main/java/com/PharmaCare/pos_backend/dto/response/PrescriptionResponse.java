package com.PharmaCare.pos_backend.dto.response;


import com.PharmaCare.pos_backend.enums.PrescriptionStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PrescriptionResponse {
    private UUID id;
    private String patientName;
    private String patientPhone;
    private String diagnosis;
    private String notes;
    private PrescriptionStatus status;
    private UUID createdBy;
    private String createdByName;
    private UUID dispensedBy;
    private String dispensedByName;
    private LocalDateTime dispensedAt;
    private List<PrescriptionItemResponse> items;
    private LocalDateTime createdAt;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PrescriptionItemResponse {
        private String medicine;
        private String dosage;
        private String frequency;
        private String duration;
        private String instructions;
    }
}