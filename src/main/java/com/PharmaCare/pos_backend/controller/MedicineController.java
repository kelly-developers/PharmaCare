package com.PharmaCare.pos_backend.controller;

import com.PharmaCare.pos_backend.dto.request.MedicineRequest;
import com.PharmaCare.pos_backend.dto.request.StockAdditionRequest;
import com.PharmaCare.pos_backend.dto.request.StockDeductionRequest;
import com.PharmaCare.pos_backend.dto.response.ApiResponse;
import com.PharmaCare.pos_backend.dto.response.MedicineResponse;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.StockMovementResponse;
import com.PharmaCare.pos_backend.service.MedicineService;
import com.PharmaCare.pos_backend.service.StockService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/medicines")
@RequiredArgsConstructor
public class MedicineController {

    private final MedicineService medicineService;
    private final StockService stockService;

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER')")
    public ResponseEntity<ApiResponse<PaginatedResponse<MedicineResponse>>> getAllMedicines(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) Boolean lowStock,
            @RequestParam(required = false) Boolean expiringSoon) {

        PaginatedResponse<MedicineResponse> medicines = medicineService.getAllMedicines(
                page, limit, search, category, lowStock, expiringSoon);
        return ResponseEntity.ok(ApiResponse.success(medicines));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER')")
    public ResponseEntity<ApiResponse<MedicineResponse>> getMedicineById(@PathVariable UUID id) {
        MedicineResponse medicine = medicineService.getMedicineById(id);
        return ResponseEntity.ok(ApiResponse.success(medicine));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST')")
    public ResponseEntity<ApiResponse<MedicineResponse>> createMedicine(
            @Valid @RequestBody MedicineRequest request) {

        MedicineResponse medicine = medicineService.createMedicine(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(medicine, "Medicine created successfully"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST')")
    public ResponseEntity<ApiResponse<MedicineResponse>> updateMedicine(
            @PathVariable UUID id,
            @Valid @RequestBody MedicineRequest request) {

        MedicineResponse medicine = medicineService.updateMedicine(id, request);
        return ResponseEntity.ok(ApiResponse.success(medicine, "Medicine updated successfully"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteMedicine(@PathVariable UUID id) {
        medicineService.deleteMedicine(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Medicine deleted successfully"));
    }

    @PostMapping("/{id}/deduct-stock")
    @PreAuthorize("hasAnyRole('ADMIN', 'CASHIER')")
    public ResponseEntity<ApiResponse<StockMovementResponse>> deductStock(
            @PathVariable UUID id,
            @Valid @RequestBody StockDeductionRequest request) {

        StockMovementResponse movement = medicineService.deductStock(id, request);
        return ResponseEntity.ok(ApiResponse.success(movement, "Stock deducted successfully"));
    }

    @PostMapping("/{id}/add-stock")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<StockMovementResponse>> addStock(
            @PathVariable UUID id,
            @Valid @RequestBody StockAdditionRequest request) {

        StockMovementResponse movement = medicineService.addStock(id, request);
        return ResponseEntity.ok(ApiResponse.success(movement, "Stock added successfully"));
    }

    @GetMapping("/categories")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER')")
    public ResponseEntity<ApiResponse<List<String>>> getAllCategories() {
        List<String> categories = medicineService.getAllCategories();
        return ResponseEntity.ok(ApiResponse.success(categories));
    }

    @GetMapping("/low-stock")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<List<MedicineResponse>>> getLowStockMedicines() {
        List<MedicineResponse> medicines = medicineService.getLowStockMedicines();
        return ResponseEntity.ok(ApiResponse.success(medicines));
    }

    @GetMapping("/expiring")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<List<MedicineResponse>>> getExpiringMedicines() {
        List<MedicineResponse> medicines = medicineService.getExpiringMedicines();
        return ResponseEntity.ok(ApiResponse.success(medicines));
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Object>> getMedicineStats() {
        long totalMedicinesCount = medicineService.countTotalMedicines();
        long totalStockQuantity = medicineService.getTotalStockQuantity();
        List<MedicineResponse> lowStockMedicines = medicineService.getLowStockMedicines();
        List<MedicineResponse> expiringMedicines = medicineService.getExpiringMedicines();

        var stats = new Object() {
            public final long totalMedicines = totalMedicinesCount;
            public final long totalStockQuantityValue = totalStockQuantity;
            public final int lowStockCount = lowStockMedicines.size();
            public final int expiringCount = expiringMedicines.size();
        };

        return ResponseEntity.ok(ApiResponse.success(stats));
    }
}