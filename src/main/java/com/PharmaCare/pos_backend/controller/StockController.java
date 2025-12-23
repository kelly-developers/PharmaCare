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
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.*;

@RestController
@RequestMapping("/api/stock")
@RequiredArgsConstructor
@Slf4j
public class StockController {

    private final StockService stockService;

    /**
     * GET /api/stock/movements - Main endpoint for stock movements
     */
    @GetMapping("/movements")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PaginatedResponse<StockMovementResponse>>> getStockMovements(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) UUID medicineId,
            @RequestParam(required = false) StockMovementType type,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {

        try {
            PaginatedResponse<StockMovementResponse> movements = stockService.getStockMovementsWithDates(
                    page, limit, medicineId, type, startDate, endDate);

            return ResponseEntity.ok(ApiResponse.success(movements, "Stock movements fetched successfully"));

        } catch (Exception e) {
            log.error("Error fetching stock movements: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to fetch stock movements. Please try again."));
        }
    }

    /**
     * POST /api/stock/loss - Record stock loss
     */
    @PostMapping("/loss")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<StockMovementResponse>> recordStockLoss(
            @Valid @RequestBody StockLossRequest request) {

        try {
            StockMovementResponse movement = stockService.recordStockLoss(request);
            return ResponseEntity.ok(ApiResponse.success(movement, "Stock loss recorded successfully"));
        } catch (Exception e) {
            log.error("Error recording stock loss: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.error("Failed to record stock loss: " + e.getMessage()));
        }
    }

    /**
     * POST /api/stock/adjustment - Record stock adjustment
     */
    @PostMapping("/adjustment")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<StockMovementResponse>> recordStockAdjustment(
            @Valid @RequestBody StockAdjustmentRequest request) {

        try {
            StockMovementResponse movement = stockService.recordStockAdjustment(request);
            return ResponseEntity.ok(ApiResponse.success(movement, "Stock adjustment recorded successfully"));
        } catch (Exception e) {
            log.error("Error recording stock adjustment: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(ApiResponse.error("Failed to record stock adjustment: " + e.getMessage()));
        }
    }

    /**
     * GET /api/stock/movements/medicine/{medicineId} - Get movements by medicine
     */
    @GetMapping("/movements/medicine/{medicineId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PaginatedResponse<StockMovementResponse>>> getStockMovementsByMedicine(
            @PathVariable UUID medicineId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit) {

        try {
            PaginatedResponse<StockMovementResponse> movements = stockService.getStockMovements(
                    page, limit, medicineId, null);
            return ResponseEntity.ok(ApiResponse.success(movements, "Stock movements fetched successfully"));
        } catch (Exception e) {
            log.error("Error fetching stock movements by medicine: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to fetch stock movements for this medicine"));
        }
    }

    /**
     * GET /api/stock/movements/reference/{referenceId} - Get movements by reference
     */
    @GetMapping("/movements/reference/{referenceId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<List<StockMovementResponse>>> getStockMovementsByReference(
            @PathVariable UUID referenceId) {

        try {
            List<StockMovementResponse> movements = stockService.getStockMovementsByReference(referenceId);
            return ResponseEntity.ok(ApiResponse.success(movements, "Stock movements fetched successfully"));
        } catch (Exception e) {
            log.error("Error fetching stock movements by reference: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to fetch stock movements for this reference"));
        }
    }

    /**
     * GET /api/stock/monthly - Monthly stock summary (optimized)
     */
    @GetMapping("/monthly")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getMonthlyStockSummary(
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM") String month) {

        try {
            // If no month specified, use current month
            YearMonth yearMonth = (month != null && !month.isEmpty())
                    ? YearMonth.parse(month)
                    : YearMonth.now();

            LocalDate startOfMonth = yearMonth.atDay(1);
            LocalDate endOfMonth = yearMonth.atEndOfMonth();

            // Get summary statistics using optimized query
            Map<String, Object> summary = stockService.getStockSummaryForPeriod(startOfMonth, endOfMonth);

            // Add additional metadata
            Map<String, Object> response = new HashMap<>();
            response.put("month", yearMonth.toString());
            response.put("startDate", startOfMonth);
            response.put("endDate", endOfMonth);
            response.put("summary", summary);
            response.put("generatedAt", LocalDateTime.now());

            return ResponseEntity.ok(ApiResponse.success(response, "Monthly stock summary generated successfully"));

        } catch (Exception e) {
            log.error("Error generating monthly stock summary: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to generate monthly stock summary"));
        }
    }

    /**
     * GET /api/stock/net-movement/{medicineId} - Get net movement for period
     */
    @GetMapping("/net-movement/{medicineId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getNetMovement(
            @PathVariable UUID medicineId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endDate) {

        try {
            Integer netMovement = stockService.getNetMovementForPeriod(medicineId, startDate, endDate);

            Map<String, Object> result = new HashMap<>();
            result.put("medicineId", medicineId);
            result.put("netMovement", netMovement != null ? netMovement : 0);
            result.put("periodStartDate", startDate);
            result.put("periodEndDate", endDate);

            return ResponseEntity.ok(ApiResponse.success(result, "Net movement calculated successfully"));
        } catch (Exception e) {
            log.error("Error calculating net movement: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to calculate net movement"));
        }
    }

    /**
     * Health check endpoint for stock module
     */
    @GetMapping("/health")
    public ResponseEntity<ApiResponse<Map<String, Object>>> healthCheck() {
        Map<String, Object> health = new HashMap<>();
        health.put("status", "OK");
        health.put("timestamp", LocalDateTime.now());
        health.put("service", "Stock Management");
        return ResponseEntity.ok(ApiResponse.success(health));
    }
}