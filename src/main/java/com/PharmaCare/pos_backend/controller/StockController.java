package com.PharmaCare.pos_backend.controller;

import com.PharmaCare.pos_backend.dto.request.StockAdjustmentRequest;
import com.PharmaCare.pos_backend.dto.request.StockLossRequest;
import com.PharmaCare.pos_backend.dto.response.ApiResponse;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.StockMovementResponse;
import com.PharmaCare.pos_backend.dto.response.StockSummaryResponse;
import com.PharmaCare.pos_backend.enums.StockMovementType;
import com.PharmaCare.pos_backend.exception.ApiException;
import com.PharmaCare.pos_backend.service.StockService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
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
            log.info("Fetching stock movements - page: {}, limit: {}, medicineId: {}, type: {}, startDate: {}, endDate: {}",
                    page, limit, medicineId, type, startDate, endDate);

            // Validate pagination parameters
            if (page < 1) {
                return ResponseEntity.badRequest()
                        .body(ApiResponse.error("Page number must be greater than 0"));
            }
            if (limit < 1 || limit > 100) {
                return ResponseEntity.badRequest()
                        .body(ApiResponse.error("Limit must be between 1 and 100"));
            }

            // Validate date range if both dates provided
            if (startDate != null && endDate != null && startDate.isAfter(endDate)) {
                return ResponseEntity.badRequest()
                        .body(ApiResponse.error("Start date cannot be after end date"));
            }

            PaginatedResponse<StockMovementResponse> movements = stockService.getStockMovementsWithDates(
                    page, limit, medicineId, type, startDate, endDate);

            return ResponseEntity.ok(ApiResponse.success(movements, "Stock movements fetched successfully"));

        } catch (ApiException e) {
            log.error("API error fetching stock movements: {}", e.getMessage(), e);
            return ResponseEntity.status(e.getStatus())
                    .body(ApiResponse.error(e.getMessage()));
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
        } catch (ApiException e) {
            log.error("API error recording stock loss: {}", e.getMessage(), e);
            return ResponseEntity.status(e.getStatus())
                    .body(ApiResponse.error(e.getMessage()));
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
        } catch (ApiException e) {
            log.error("API error recording stock adjustment: {}", e.getMessage(), e);
            return ResponseEntity.status(e.getStatus())
                    .body(ApiResponse.error(e.getMessage()));
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
            // Validate pagination parameters
            if (page < 1) {
                return ResponseEntity.badRequest()
                        .body(ApiResponse.error("Page number must be greater than 0"));
            }
            if (limit < 1 || limit > 100) {
                return ResponseEntity.badRequest()
                        .body(ApiResponse.error("Limit must be between 1 and 100"));
            }

            PaginatedResponse<StockMovementResponse> movements = stockService.getStockMovements(
                    page, limit, medicineId, null);
            return ResponseEntity.ok(ApiResponse.success(movements, "Stock movements fetched successfully"));
        } catch (ApiException e) {
            log.error("API error fetching stock movements by medicine: {}", e.getMessage(), e);
            return ResponseEntity.status(e.getStatus())
                    .body(ApiResponse.error(e.getMessage()));
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
    public ResponseEntity<ApiResponse<StockSummaryResponse>> getMonthlyStockSummary(
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM") String month) {

        try {
            // If no month specified, use current month
            YearMonth yearMonth = (month != null && !month.isEmpty())
                    ? YearMonth.parse(month)
                    : YearMonth.now();

            LocalDate startOfMonth = yearMonth.atDay(1);
            LocalDate endOfMonth = yearMonth.atEndOfMonth();

            // Get summary statistics
            StockSummaryResponse summary = stockService.getStockSummaryForPeriod(startOfMonth, endOfMonth);

            return ResponseEntity.ok(ApiResponse.success(summary, "Monthly stock summary generated successfully"));

        } catch (ApiException e) {
            log.error("API error generating monthly stock summary: {}", e.getMessage(), e);
            return ResponseEntity.status(e.getStatus())
                    .body(ApiResponse.error(e.getMessage()));
        } catch (Exception e) {
            log.error("Error generating monthly stock summary: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to generate monthly stock summary"));
        }
    }

    /**
     * GET /api/stock/summary - Get stock summary for custom date range
     */
    @GetMapping("/summary")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<StockSummaryResponse>> getStockSummary(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {

        try {
            // Validate date range if both dates provided
            if (startDate != null && endDate != null && startDate.isAfter(endDate)) {
                return ResponseEntity.badRequest()
                        .body(ApiResponse.error("Start date cannot be after end date"));
            }

            StockSummaryResponse summary = stockService.getStockSummaryForPeriod(startDate, endDate);
            return ResponseEntity.ok(ApiResponse.success(summary, "Stock summary generated successfully"));
        } catch (ApiException e) {
            log.error("API error generating stock summary: {}", e.getMessage(), e);
            return ResponseEntity.status(e.getStatus())
                    .body(ApiResponse.error(e.getMessage()));
        } catch (Exception e) {
            log.error("Error generating stock summary: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to generate stock summary"));
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
            // Validate date range
            if (startDate.isAfter(endDate)) {
                return ResponseEntity.badRequest()
                        .body(ApiResponse.error("Start date cannot be after end date"));
            }

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
     * GET /api/stock/breakdown - Get stock breakdown for UI
     */
    @GetMapping("/breakdown")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStockBreakdown() {
        try {
            List<StockService.StockBreakdownResponse> breakdown = stockService.getStockBreakdown();

            // Calculate totals
            BigDecimal openingValue = breakdown.stream()
                    .map(StockService.StockBreakdownResponse::getOpenValue)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            BigDecimal closingValue = breakdown.stream()
                    .map(StockService.StockBreakdownResponse::getCloseValue)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            Map<String, Object> response = new HashMap<>();
            response.put("breakdown", breakdown);
            response.put("openingValue", openingValue);
            response.put("closingValue", closingValue);
            response.put("cogs", BigDecimal.ZERO); // Calculate from sales if needed
            response.put("missingItems", 0);
            response.put("missingValue", BigDecimal.ZERO);
            response.put("generatedAt", LocalDateTime.now());

            return ResponseEntity.ok(ApiResponse.success(response, "Stock breakdown fetched successfully"));
        } catch (Exception e) {
            log.error("Error fetching stock breakdown: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to fetch stock breakdown"));
        }
    }

    /**
     * GET /api/stock/recent - Get recent stock movements
     */
    @GetMapping("/recent")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<List<StockMovementResponse>>> getRecentStockMovements(
            @RequestParam(defaultValue = "10") int limit) {
        try {
            if (limit < 1 || limit > 100) {
                return ResponseEntity.badRequest()
                        .body(ApiResponse.error("Limit must be between 1 and 100"));
            }

            List<StockMovementResponse> movements = stockService.getRecentStockMovements(limit);
            return ResponseEntity.ok(ApiResponse.success(movements, "Recent stock movements fetched successfully"));
        } catch (ApiException e) {
            log.error("API error fetching recent stock movements: {}", e.getMessage(), e);
            return ResponseEntity.status(e.getStatus())
                    .body(ApiResponse.error(e.getMessage()));
        } catch (Exception e) {
            log.error("Error fetching recent stock movements: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to fetch recent stock movements"));
        }
    }

    /**
     * GET /api/stock/movements/medicine/{medicineId}/filtered - Get filtered movements for a medicine
     */
    @GetMapping("/movements/medicine/{medicineId}/filtered")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PaginatedResponse<StockMovementResponse>>> getFilteredMovementsForMedicine(
            @PathVariable UUID medicineId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) StockMovementType type,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {

        try {
            // Validate parameters
            if (page < 1) {
                return ResponseEntity.badRequest()
                        .body(ApiResponse.error("Page number must be greater than 0"));
            }
            if (limit < 1 || limit > 100) {
                return ResponseEntity.badRequest()
                        .body(ApiResponse.error("Limit must be between 1 and 100"));
            }
            if (startDate != null && endDate != null && startDate.isAfter(endDate)) {
                return ResponseEntity.badRequest()
                        .body(ApiResponse.error("Start date cannot be after end date"));
            }

            PaginatedResponse<StockMovementResponse> movements = stockService.getStockMovementsWithDates(
                    page, limit, medicineId, type, startDate, endDate);
            return ResponseEntity.ok(ApiResponse.success(movements, "Filtered stock movements fetched successfully"));
        } catch (ApiException e) {
            log.error("API error fetching filtered stock movements: {}", e.getMessage(), e);
            return ResponseEntity.status(e.getStatus())
                    .body(ApiResponse.error(e.getMessage()));
        } catch (Exception e) {
            log.error("Error fetching filtered stock movements: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to fetch filtered stock movements"));
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
        health.put("endpoints", Arrays.asList(
                "GET /api/stock/movements",
                "GET /api/stock/movements/medicine/{id}",
                "GET /api/stock/summary",
                "GET /api/stock/monthly",
                "GET /api/stock/breakdown",
                "POST /api/stock/loss",
                "POST /api/stock/adjustment"
        ));
        return ResponseEntity.ok(ApiResponse.success(health));
    }

    /**
     * DELETE /api/stock/movements/{id} - Delete a stock movement (admin only)
     */
    @DeleteMapping("/movements/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteStockMovement(@PathVariable UUID id) {
        try {
            stockService.deleteStockMovement(id);
            return ResponseEntity.ok(ApiResponse.success(null, "Stock movement deleted successfully"));
        } catch (ApiException e) {
            log.error("API error deleting stock movement: {}", e.getMessage(), e);
            return ResponseEntity.status(e.getStatus())
                    .body(ApiResponse.error(e.getMessage()));
        } catch (Exception e) {
            log.error("Error deleting stock movement: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to delete stock movement"));
        }
    }
}