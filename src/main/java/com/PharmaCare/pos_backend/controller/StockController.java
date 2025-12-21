package com.PharmaCare.pos_backend.controller;

import com.PharmaCare.pos_backend.dto.request.StockAdjustmentRequest;
import com.PharmaCare.pos_backend.dto.request.StockLossRequest;
import com.PharmaCare.pos_backend.dto.response.ApiResponse;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.StockMovementResponse;
import com.PharmaCare.pos_backend.enums.StockMovementType;
import com.PharmaCare.pos_backend.service.StockService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@RestController
@RequestMapping("/api/stock")
@RequiredArgsConstructor
public class StockController {

    private final StockService stockService;

    @GetMapping("/movements")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PaginatedResponse<StockMovementResponse>>> getStockMovements(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) UUID medicineId,
            @RequestParam(required = false) StockMovementType type,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {

        PaginatedResponse<StockMovementResponse> movements = stockService.getStockMovementsWithDates(
                page, limit, medicineId, type, startDate, endDate);
        return ResponseEntity.ok(ApiResponse.success(movements));
    }

    @PostMapping("/loss")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<StockMovementResponse>> recordStockLoss(
            @Valid @RequestBody StockLossRequest request) {

        StockMovementResponse movement = stockService.recordStockLoss(request);
        return ResponseEntity.ok(ApiResponse.success(movement, "Stock loss recorded successfully"));
    }



    @PostMapping("/adjustment")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<StockMovementResponse>> recordStockAdjustment(
            @Valid @RequestBody StockAdjustmentRequest request) {

        StockMovementResponse movement = stockService.recordStockAdjustment(request);
        return ResponseEntity.ok(ApiResponse.success(movement, "Stock adjustment recorded successfully"));
    }

    @GetMapping("/movements/medicine/{medicineId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PaginatedResponse<StockMovementResponse>>> getStockMovementsByMedicine(
            @PathVariable UUID medicineId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit) {

        // Use the simple method without dates
        PaginatedResponse<StockMovementResponse> movements = stockService.getStockMovements(
                page, limit, medicineId, null);
        return ResponseEntity.ok(ApiResponse.success(movements));
    }

    @GetMapping("/movements/reference/{referenceId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Object>> getStockMovementsByReference(@PathVariable UUID referenceId) {
        var movements = stockService.getStockMovementsByReference(referenceId);
        return ResponseEntity.ok(ApiResponse.success(movements));
    }

    @GetMapping("/net-movement/{medicineId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Object>> getNetMovement(
            @PathVariable UUID medicineId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endDate) {

        Integer netMovement = stockService.getNetMovementForPeriod(medicineId, startDate, endDate);

        var result = new Object() {
            public final UUID medicineIdValue = medicineId;
            public final Integer netMovementValue = netMovement;
            public final LocalDateTime periodStartDate = startDate;
            public final LocalDateTime periodEndDate = endDate;
        };

        return ResponseEntity.ok(ApiResponse.success(result));
    }
}