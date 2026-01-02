package com.PharmaCare.pos_backend.controller;

import com.PharmaCare.pos_backend.dto.response.*;
import com.PharmaCare.pos_backend.dto.response.ApiResponse;
import com.PharmaCare.pos_backend.model.Medicine;
import com.PharmaCare.pos_backend.repository.MedicineRepository;
import com.PharmaCare.pos_backend.service.ReportService;
import com.PharmaCare.pos_backend.util.StockCalculator;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
@Slf4j
public class ReportController {

    private final ReportService reportService;
    private final MedicineRepository medicineRepository;

    @GetMapping("/dashboard")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER')")
    public ResponseEntity<ApiResponse<DashboardSummary>> getDashboardSummary() {
        try {
            log.info("=== FETCHING DASHBOARD DATA ===");

            // Get base summary from service
            DashboardSummary summary = reportService.getDashboardSummary();

            // Get all active medicines
            List<Medicine> allMedicines = medicineRepository.findByActiveTrue();
            log.info("Found {} active medicines", allMedicines.size());

            // Calculate inventory value at COST PRICE
            BigDecimal inventoryValueCost = BigDecimal.ZERO;
            // Calculate stock value at SELLING PRICE
            BigDecimal stockValueSelling = BigDecimal.ZERO;

            for (Medicine medicine : allMedicines) {
                if (medicine.getStockQuantity() > 0) {
                    // Calculate cost value
                    BigDecimal medicineCostValue = StockCalculator.calculateCostStockValue(medicine);
                    inventoryValueCost = inventoryValueCost.add(medicineCostValue);

                    // Calculate selling value
                    BigDecimal medicineSellingValue = StockCalculator.calculateSellingStockValue(medicine);
                    stockValueSelling = stockValueSelling.add(medicineSellingValue);
                }
            }

            // Update summary with calculated values
            summary.setInventoryValue(inventoryValueCost);
            summary.setStockValue(stockValueSelling);
            summary.setTotalStockItems(allMedicines.size());

            log.info("=== DASHBOARD CALCULATIONS ===");
            log.info("Inventory Value (Cost): KSh {}", inventoryValueCost);
            log.info("Stock Value (Selling): KSh {}", stockValueSelling);
            log.info("Total Items: {}", allMedicines.size());

            return ResponseEntity.ok(ApiResponse.success(summary, "Dashboard data fetched successfully"));

        } catch (Exception e) {
            log.error("Error fetching dashboard data: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to fetch dashboard data"));
        }
    }

    @GetMapping("/sales-summary")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<SalesSummary>> getSalesSummary(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(defaultValue = "day") String groupBy) {

        try {
            SalesSummary summary = reportService.getSalesSummary(startDate, endDate, groupBy);
            return ResponseEntity.ok(ApiResponse.success(summary, "Sales summary fetched successfully"));
        } catch (Exception e) {
            log.error("Error fetching sales summary: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to fetch sales summary"));
        }
    }

    @GetMapping("/stock-summary")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<StockSummary>> getStockSummary() {
        try {
            StockSummary summary = reportService.getStockSummary();
            return ResponseEntity.ok(ApiResponse.success(summary, "Stock summary fetched successfully"));
        } catch (Exception e) {
            log.error("Error fetching stock summary: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to fetch stock summary"));
        }
    }

    @GetMapping("/balance-sheet")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<BalanceSheet>> getBalanceSheet(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf) {

        try {
            if (asOf == null) {
                asOf = LocalDate.now();
            }

            BalanceSheet balanceSheet = reportService.getBalanceSheet(asOf);
            return ResponseEntity.ok(ApiResponse.success(balanceSheet, "Balance sheet fetched successfully"));
        } catch (Exception e) {
            log.error("Error fetching balance sheet: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to fetch balance sheet"));
        }
    }

    @GetMapping("/income-statement")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<IncomeStatement>> getIncomeStatement(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {

        try {
            IncomeStatement incomeStatement = reportService.getIncomeStatement(startDate, endDate);
            return ResponseEntity.ok(ApiResponse.success(incomeStatement, "Income statement fetched successfully"));
        } catch (Exception e) {
            log.error("Error fetching income statement: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to fetch income statement"));
        }
    }

    @GetMapping("/inventory-value")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getInventoryValue() {
        try {
            List<Medicine> allMedicines = medicineRepository.findByActiveTrue();

            BigDecimal totalValue = BigDecimal.ZERO;
            Map<String, BigDecimal> categoryValues = new HashMap<>();
            Map<String, Integer> categoryCounts = new HashMap<>();

            for (Medicine medicine : allMedicines) {
                BigDecimal medicineValue = StockCalculator.calculateCostStockValue(medicine);
                totalValue = totalValue.add(medicineValue);

                String category = medicine.getCategory() != null ? medicine.getCategory() : "Uncategorized";
                categoryValues.put(category,
                        categoryValues.getOrDefault(category, BigDecimal.ZERO).add(medicineValue));
                categoryCounts.put(category,
                        categoryCounts.getOrDefault(category, 0) + 1);
            }

            Map<String, Object> response = new HashMap<>();
            response.put("totalValue", totalValue);
            response.put("categoryValues", categoryValues);
            response.put("categoryCounts", categoryCounts);
            response.put("itemCount", allMedicines.size());
            response.put("valueType", "COST_PRICE");
            response.put("calculatedAt", LocalDateTime.now());

            return ResponseEntity.ok(ApiResponse.success(response, "Inventory value (cost) calculated successfully"));

        } catch (Exception e) {
            log.error("Error calculating inventory value: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to calculate inventory value"));
        }
    }

    @GetMapping("/stock-value")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStockValue() {
        try {
            List<Medicine> allMedicines = medicineRepository.findByActiveTrue();

            BigDecimal totalValue = BigDecimal.ZERO;
            Map<String, BigDecimal> categoryValues = new HashMap<>();
            Map<String, Integer> categoryCounts = new HashMap<>();

            for (Medicine medicine : allMedicines) {
                BigDecimal medicineValue = StockCalculator.calculateSellingStockValue(medicine);
                totalValue = totalValue.add(medicineValue);

                String category = medicine.getCategory() != null ? medicine.getCategory() : "Uncategorized";
                categoryValues.put(category,
                        categoryValues.getOrDefault(category, BigDecimal.ZERO).add(medicineValue));
                categoryCounts.put(category,
                        categoryCounts.getOrDefault(category, 0) + 1);
            }

            Map<String, Object> response = new HashMap<>();
            response.put("totalValue", totalValue);
            response.put("categoryValues", categoryValues);
            response.put("categoryCounts", categoryCounts);
            response.put("itemCount", allMedicines.size());
            response.put("valueType", "SELLING_PRICE");
            response.put("calculatedAt", LocalDateTime.now());

            return ResponseEntity.ok(ApiResponse.success(response, "Stock value (selling) calculated successfully"));

        } catch (Exception e) {
            log.error("Error calculating stock value: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to calculate stock value"));
        }
    }

    @GetMapping("/stock-breakdown")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStockBreakdown() {
        try {
            List<Medicine> allMedicines = medicineRepository.findByActiveTrue();

            BigDecimal totalCostValue = BigDecimal.ZERO;
            BigDecimal totalSellingValue = BigDecimal.ZERO;
            int lowStockCount = 0;
            int expiringSoonCount = 0;

            LocalDate expiryThreshold = LocalDate.now().plusDays(90);

            for (Medicine medicine : allMedicines) {
                BigDecimal costValue = StockCalculator.calculateCostStockValue(medicine);
                BigDecimal sellingValue = StockCalculator.calculateSellingStockValue(medicine);

                totalCostValue = totalCostValue.add(costValue);
                totalSellingValue = totalSellingValue.add(sellingValue);

                if (medicine.getStockQuantity() <= medicine.getReorderLevel()) {
                    lowStockCount++;
                }

                if (medicine.getExpiryDate() != null &&
                        medicine.getExpiryDate().isBefore(expiryThreshold)) {
                    expiringSoonCount++;
                }
            }

            Map<String, Object> breakdown = new HashMap<>();
            breakdown.put("totalCostValue", totalCostValue);
            breakdown.put("totalSellingValue", totalSellingValue);
            breakdown.put("itemCount", allMedicines.size());
            breakdown.put("lowStockCount", lowStockCount);
            breakdown.put("expiringSoonCount", expiringSoonCount);
            breakdown.put("calculatedAt", LocalDateTime.now());

            return ResponseEntity.ok(ApiResponse.success(breakdown, "Stock breakdown calculated successfully"));

        } catch (Exception e) {
            log.error("Error calculating stock breakdown: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to calculate stock breakdown"));
        }
    }

    @GetMapping("/medicine-values")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER', 'PHARMACIST')")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getMedicineValues() {
        try {
            List<Medicine> allMedicines = medicineRepository.findByActiveTrue();

            List<Map<String, Object>> medicineValues = allMedicines.stream()
                    .map(medicine -> {
                        Map<String, Object> medicineData = new HashMap<>();
                        medicineData.put("id", medicine.getId());
                        medicineData.put("name", medicine.getName());
                        medicineData.put("category", medicine.getCategory());
                        medicineData.put("stockQuantity", medicine.getStockQuantity());

                        BigDecimal costValue = StockCalculator.calculateCostStockValue(medicine);
                        BigDecimal sellingValue = StockCalculator.calculateSellingStockValue(medicine);

                        medicineData.put("costValue", costValue);
                        medicineData.put("sellingValue", sellingValue);

                        return medicineData;
                    })
                    .toList();

            return ResponseEntity.ok(ApiResponse.success(medicineValues, "Medicine values calculated successfully"));

        } catch (Exception e) {
            log.error("Error calculating medicine values: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to calculate medicine values"));
        }
    }

    @GetMapping("/inventory-breakdown")
    @PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getInventoryBreakdown() {
        try {
            Map<String, Object> breakdown = reportService.getInventoryBreakdown();
            return ResponseEntity.ok(ApiResponse.success(breakdown, "Inventory breakdown calculated successfully"));
        } catch (Exception e) {
            log.error("Error calculating inventory breakdown: {}", e.getMessage(), e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(ApiResponse.error("Failed to calculate inventory breakdown"));
        }
    }
}