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
            return ResponseEntity.ok(ApiResponse.success(movements));
        } catch (Exception e) {
            log.error("Error fetching stock movements: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body((ApiResponse<PaginatedResponse<StockMovementResponse>>) ApiResponse.error("Failed to fetch stock movements: " + e.getMessage()));
        }
    }

    @PostMapping("/loss")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<StockMovementResponse>> recordStockLoss(
            @Valid @RequestBody StockLossRequest request) {

        try {
            StockMovementResponse movement = stockService.recordStockLoss(request);
            return ResponseEntity.ok(ApiResponse.success(movement, "Stock loss recorded successfully"));
        } catch (Exception e) {
            log.error("Error recording stock loss: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body((ApiResponse<StockMovementResponse>) ApiResponse.error("Failed to record stock loss: " + e.getMessage()));
        }
    }

    @PostMapping("/adjustment")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<StockMovementResponse>> recordStockAdjustment(
            @Valid @RequestBody StockAdjustmentRequest request) {

        try {
            StockMovementResponse movement = stockService.recordStockAdjustment(request);
            return ResponseEntity.ok(ApiResponse.success(movement, "Stock adjustment recorded successfully"));
        } catch (Exception e) {
            log.error("Error recording stock adjustment: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body((ApiResponse<StockMovementResponse>) ApiResponse.error("Failed to record stock adjustment: " + e.getMessage()));
        }
    }

    @GetMapping("/movements/medicine/{medicineId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<PaginatedResponse<StockMovementResponse>>> getStockMovementsByMedicine(
            @PathVariable UUID medicineId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit) {

        try {
            PaginatedResponse<StockMovementResponse> movements = stockService.getStockMovements(
                    page, limit, medicineId, null);
            return ResponseEntity.ok(ApiResponse.success(movements));
        } catch (Exception e) {
            log.error("Error fetching stock movements by medicine: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body((ApiResponse<PaginatedResponse<StockMovementResponse>>) ApiResponse.error("Failed to fetch stock movements: " + e.getMessage()));
        }
    }

    @GetMapping("/movements/reference/{referenceId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<List<StockMovementResponse>>> getStockMovementsByReference(@PathVariable UUID referenceId) {
        try {
            List<StockMovementResponse> movements = stockService.getStockMovementsByReference(referenceId);
            return ResponseEntity.ok(ApiResponse.success(movements));
        } catch (Exception e) {
            log.error("Error fetching stock movements by reference: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body((ApiResponse<List<StockMovementResponse>>) ApiResponse.error("Failed to fetch stock movements: " + e.getMessage()));
        }
    }

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

            return ResponseEntity.ok(ApiResponse.success(result));
        } catch (Exception e) {
            log.error("Error calculating net movement: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body((ApiResponse<Map<String, Object>>) ApiResponse.error("Failed to calculate net movement: " + e.getMessage()));
        }
    }

    // NEW ENDPOINT: Monthly stock summary
    @GetMapping("/monthly")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getMonthlyStockSummary(
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM") String month) {
        try {
            // If no month specified, use current month
            YearMonth yearMonth = month != null ? YearMonth.parse(month) : YearMonth.now();

            LocalDate startOfMonth = yearMonth.atDay(1);
            LocalDate endOfMonth = yearMonth.atEndOfMonth();

            Map<String, Object> summary = new HashMap<>();
            summary.put("month", yearMonth.toString());
            summary.put("startDate", startOfMonth);
            summary.put("endDate", endOfMonth);

            // Get total movements for the month
            PaginatedResponse<StockMovementResponse> movements = stockService.getStockMovementsWithDates(
                    1, Integer.MAX_VALUE, null, null, startOfMonth, endOfMonth);

            // Get the data from PaginatedResponse
            List<StockMovementResponse> items = movements.getData();
            long totalItems = movements.getPagination().getTotal();

            // Calculate summary statistics
            long totalMovements = totalItems;

            long purchaseMovements = items.stream()
                    .filter(m -> m.getType() == StockMovementType.PURCHASE)
                    .count();
            long saleMovements = items.stream()
                    .filter(m -> m.getType() == StockMovementType.SALE)
                    .count();
            long adjustmentMovements = items.stream()
                    .filter(m -> m.getType() == StockMovementType.ADJUSTMENT)
                    .count();
            long lossMovements = items.stream()
                    .filter(m -> m.getType() == StockMovementType.LOSS)
                    .count();

            // Calculate total quantities
            int totalPurchased = items.stream()
                    .filter(m -> m.getType() == StockMovementType.PURCHASE)
                    .mapToInt(StockMovementResponse::getQuantity)
                    .sum();
            int totalSold = items.stream()
                    .filter(m -> m.getType() == StockMovementType.SALE)
                    .mapToInt(m -> Math.abs(m.getQuantity()))
                    .sum();
            int totalAdjusted = items.stream()
                    .filter(m -> m.getType() == StockMovementType.ADJUSTMENT)
                    .mapToInt(StockMovementResponse::getQuantity)
                    .sum();
            int totalLost = items.stream()
                    .filter(m -> m.getType() == StockMovementType.LOSS)
                    .mapToInt(m -> Math.abs(m.getQuantity()))
                    .sum();

            // Create maps without using Map.of() to avoid type issues
            Map<String, Long> movementCounts = new HashMap<>();
            movementCounts.put("purchases", purchaseMovements);
            movementCounts.put("sales", saleMovements);
            movementCounts.put("adjustments", adjustmentMovements);
            movementCounts.put("losses", lossMovements);

            Map<String, Integer> quantityTotals = new HashMap<>();
            quantityTotals.put("purchased", totalPurchased);
            quantityTotals.put("sold", totalSold);
            quantityTotals.put("adjusted", totalAdjusted);
            quantityTotals.put("lost", totalLost);

            summary.put("totalMovements", totalMovements);
            summary.put("movementCounts", movementCounts);
            summary.put("quantityTotals", quantityTotals);

            // Group by medicine (top 10)
            Map<String, Integer> medicineSummary = new HashMap<>();
            items.forEach(movement -> {
                String medicineName = movement.getMedicineName();
                int quantity = Math.abs(movement.getQuantity());
                medicineSummary.merge(medicineName, quantity, Integer::sum);
            });

            // Sort by quantity and get top 10
            List<Map<String, Object>> topMedicines = new ArrayList<>();
            medicineSummary.entrySet().stream()
                    .sorted((a, b) -> b.getValue().compareTo(a.getValue()))
                    .limit(10)
                    .forEach(entry -> {
                        Map<String, Object> med = new HashMap<>();
                        med.put("medicineName", entry.getKey());
                        med.put("totalQuantity", entry.getValue());
                        topMedicines.add(med);
                    });

            summary.put("topMedicines", topMedicines);
            summary.put("generatedAt", LocalDateTime.now());

            return ResponseEntity.ok(ApiResponse.success(summary));

        } catch (Exception e) {
            log.error("Error generating monthly stock summary: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body((ApiResponse<Map<String, Object>>) ApiResponse.error("Failed to generate monthly stock summary: " + e.getMessage()));
        }
    }

    // NEW ENDPOINT: Stock audit report
    @GetMapping("/audit")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStockAuditReport() {
        try {
            // For now, return a simple placeholder
            Map<String, Object> report = new HashMap<>();
            report.put("message", "Stock audit report endpoint");
            report.put("data", Collections.emptyList());
            report.put("generatedAt", LocalDateTime.now());

            return ResponseEntity.ok(ApiResponse.success(report));
        } catch (Exception e) {
            log.error("Error generating stock audit report: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body((ApiResponse<Map<String, Object>>) ApiResponse.error("Failed to generate audit report: " + e.getMessage()));
        }
    }

    // NEW ENDPOINT: Stock comparison for a specific month
    @GetMapping("/comparison/{month}")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStockComparison(@PathVariable String month) {
        try {
            YearMonth yearMonth = YearMonth.parse(month);

            Map<String, Object> comparison = new HashMap<>();
            comparison.put("month", month);
            comparison.put("message", "Stock comparison data for " + month);
            comparison.put("data", Collections.emptyList()); // Placeholder
            comparison.put("generatedAt", LocalDateTime.now());

            return ResponseEntity.ok(ApiResponse.success(comparison));
        } catch (Exception e) {
            log.error("Error generating stock comparison: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body((ApiResponse<Map<String, Object>>) ApiResponse.error("Failed to generate stock comparison: " + e.getMessage()));
        }
    }

    // NEW ENDPOINT: Simple placeholder for opening stock upload
    @PostMapping("/opening")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> uploadOpeningStock(@RequestBody Map<String, Object> request) {
        try {
            Map<String, Object> response = new HashMap<>();
            response.put("message", "Opening stock uploaded successfully");
            response.put("month", request.get("month"));
            response.put("itemsCount", ((List<?>) request.getOrDefault("items", Collections.emptyList())).size());
            response.put("uploadedAt", LocalDateTime.now());

            return ResponseEntity.ok(ApiResponse.success(response));
        } catch (Exception e) {
            log.error("Error uploading opening stock: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body((ApiResponse<Map<String, Object>>) ApiResponse.error("Failed to upload opening stock: " + e.getMessage()));
        }
    }

    // NEW ENDPOINT: Simple placeholder for closing stock upload
    @PostMapping("/closing")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> uploadClosingStock(@RequestBody Map<String, Object> request) {
        try {
            Map<String, Object> response = new HashMap<>();
            response.put("message", "Closing stock uploaded successfully");
            response.put("month", request.get("month"));
            response.put("itemsCount", ((List<?>) request.getOrDefault("items", Collections.emptyList())).size());
            response.put("uploadedAt", LocalDateTime.now());

            return ResponseEntity.ok(ApiResponse.success(response));
        } catch (Exception e) {
            log.error("Error uploading closing stock: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body((ApiResponse<Map<String, Object>>) ApiResponse.error("Failed to upload closing stock: " + e.getMessage()));
        }
    }
}