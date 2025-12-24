package com.PharmaCare.pos_backend.controller;

import com.PharmaCare.pos_backend.dto.request.PrescriptionRequest;
import com.PharmaCare.pos_backend.dto.response.ApiResponse;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.PrescriptionResponse;
import com.PharmaCare.pos_backend.enums.PrescriptionStatus;
import com.PharmaCare.pos_backend.service.PrescriptionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/prescriptions")
@RequiredArgsConstructor
public class PrescriptionController {

    private final PrescriptionService prescriptionService;

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER')")
    public ResponseEntity<ApiResponse<PaginatedResponse<PrescriptionResponse>>> getAllPrescriptions(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) PrescriptionStatus status,
            @RequestParam(required = false) String patientPhone,
            @RequestParam(required = false) UUID createdBy) {

        PaginatedResponse<PrescriptionResponse> prescriptions = prescriptionService.getAllPrescriptions(
                page, limit, status, patientPhone, createdBy);
        return ResponseEntity.ok(ApiResponse.success(prescriptions));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER')")
    public ResponseEntity<ApiResponse<PrescriptionResponse>> getPrescriptionById(@PathVariable UUID id) {
        PrescriptionResponse prescription = prescriptionService.getPrescriptionById(id);
        return ResponseEntity.ok(ApiResponse.success(prescription));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST')")
    public ResponseEntity<ApiResponse<PrescriptionResponse>> createPrescription(
            @Valid @RequestBody PrescriptionRequest request,
            Authentication authentication) {

        // Get current user from authentication instead of request
        String currentUsername = authentication.getName();
        PrescriptionResponse prescription = prescriptionService.createPrescription(request, currentUsername);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(prescription, "Prescription created successfully"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST')")
    public ResponseEntity<ApiResponse<PrescriptionResponse>> updatePrescription(
            @PathVariable UUID id,
            @Valid @RequestBody PrescriptionRequest request,
            Authentication authentication) {

        // Get current user from authentication for logging/audit if needed
        String currentUsername = authentication.getName();
        PrescriptionResponse prescription = prescriptionService.updatePrescription(id, request);

        return ResponseEntity.ok(ApiResponse.success(prescription, "Prescription updated successfully"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST')")
    public ResponseEntity<ApiResponse<Void>> deletePrescription(@PathVariable UUID id) {
        prescriptionService.deletePrescription(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Prescription deleted successfully"));
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER')")
    public ResponseEntity<ApiResponse<PrescriptionResponse>> updatePrescriptionStatus(
            @PathVariable UUID id,
            @RequestParam PrescriptionStatus status,
            @RequestParam(required = false) UUID dispensedBy,
            Authentication authentication) {

        // Get current user from authentication if dispensedBy is not provided
        if (dispensedBy == null && status == PrescriptionStatus.DISPENSED) {
            String currentUsername = authentication.getName();
            // You might want to fetch the user ID from the username here
            // For now, we'll use the service method that handles this
        }

        PrescriptionResponse prescription = prescriptionService.updatePrescriptionStatus(id, status, dispensedBy);
        return ResponseEntity.ok(ApiResponse.success(prescription, "Prescription status updated successfully"));
    }

    @GetMapping("/pending")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER')")
    public ResponseEntity<ApiResponse<Object>> getPendingPrescriptions() {
        var prescriptions = prescriptionService.getPendingPrescriptions();
        return ResponseEntity.ok(ApiResponse.success(prescriptions));
    }

    @GetMapping("/dispensed")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER')")
    public ResponseEntity<ApiResponse<Object>> getDispensedPrescriptions() {
        var prescriptions = prescriptionService.getDispensedPrescriptions();
        return ResponseEntity.ok(ApiResponse.success(prescriptions));
    }

    @GetMapping("/patient/{phone}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER')")
    public ResponseEntity<ApiResponse<Object>> getPrescriptionsByPatientPhone(@PathVariable String phone) {
        var prescriptions = prescriptionService.getPrescriptionsByPatientPhone(phone);
        return ResponseEntity.ok(ApiResponse.success(prescriptions));
    }

    @GetMapping("/creator/{userId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST')")
    public ResponseEntity<ApiResponse<Object>> getPrescriptionsByCreator(@PathVariable UUID userId) {
        var prescriptions = prescriptionService.getPrescriptionsByCreator(userId);
        return ResponseEntity.ok(ApiResponse.success(prescriptions));
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Object>> getPrescriptionStats() {
        long pendingPrescriptions = prescriptionService.countPrescriptionsByStatus(PrescriptionStatus.PENDING);
        long dispensedPrescriptions = prescriptionService.countPrescriptionsByStatus(PrescriptionStatus.DISPENSED);
        long cancelledPrescriptions = prescriptionService.countPrescriptionsByStatus(PrescriptionStatus.CANCELLED);

        var stats = new Object() {
            public final long pendingCount = pendingPrescriptions;
            public final long dispensedCount = dispensedPrescriptions;
            public final long cancelledCount = cancelledPrescriptions;
            public final long totalCount = pendingPrescriptions + dispensedPrescriptions + cancelledPrescriptions;
        };

        return ResponseEntity.ok(ApiResponse.success(stats));
    }
}