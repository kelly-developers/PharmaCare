package com.PharmaCare.pos_backend.controller;

import com.PharmaCare.pos_backend.dto.request.SupplierRequest;
import com.PharmaCare.pos_backend.dto.response.ApiResponse;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.SupplierResponse;
import com.PharmaCare.pos_backend.service.SupplierService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/suppliers")
@RequiredArgsConstructor
public class SupplierController {

    private final SupplierService supplierService;

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PaginatedResponse<SupplierResponse>>> getAllSuppliers(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Boolean activeOnly) {

        PaginatedResponse<SupplierResponse> suppliers = supplierService.getAllSuppliers(page, limit, search, activeOnly);
        return ResponseEntity.ok(ApiResponse.success(suppliers));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<SupplierResponse>> getSupplierById(@PathVariable UUID id) {
        SupplierResponse supplier = supplierService.getSupplierById(id);
        return ResponseEntity.ok(ApiResponse.success(supplier));
    }

    @GetMapping("/name/{name}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<SupplierResponse>> getSupplierByName(@PathVariable String name) {
        SupplierResponse supplier = supplierService.getSupplierByName(name);
        return ResponseEntity.ok(ApiResponse.success(supplier));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<SupplierResponse>> createSupplier(
            @Valid @RequestBody SupplierRequest request) {

        SupplierResponse supplier = supplierService.createSupplier(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(supplier, "Supplier created successfully"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<SupplierResponse>> updateSupplier(
            @PathVariable UUID id,
            @Valid @RequestBody SupplierRequest request) {

        SupplierResponse supplier = supplierService.updateSupplier(id, request);
        return ResponseEntity.ok(ApiResponse.success(supplier, "Supplier updated successfully"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Void>> deleteSupplier(@PathVariable UUID id) {
        supplierService.deleteSupplier(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Supplier deactivated successfully"));
    }

    @PatchMapping("/{id}/activate")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Void>> activateSupplier(@PathVariable UUID id) {
        supplierService.activateSupplier(id);
        return ResponseEntity.ok(ApiResponse.success(null, "Supplier activated successfully"));
    }

    @GetMapping("/active")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<List<SupplierResponse>>> getActiveSuppliers() {
        List<SupplierResponse> suppliers = supplierService.getActiveSuppliers();
        return ResponseEntity.ok(ApiResponse.success(suppliers));
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Object>> getSupplierStats() {
        long activeCount = supplierService.countActiveSuppliers();

        var stats = new Object() {
            public final long activeSuppliers = activeCount;
        };

        return ResponseEntity.ok(ApiResponse.success(stats));
    }
}