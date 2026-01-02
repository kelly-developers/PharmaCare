package com.PharmaCare.pos_backend.service;

import com.PharmaCare.pos_backend.dto.request.StockAdditionRequest;
import com.PharmaCare.pos_backend.dto.request.StockAdjustmentRequest;
import com.PharmaCare.pos_backend.dto.request.StockDeductionRequest;
import com.PharmaCare.pos_backend.dto.request.StockLossRequest;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.StockMovementResponse;
import com.PharmaCare.pos_backend.dto.response.StockSummaryResponse;
import com.PharmaCare.pos_backend.enums.Role;
import com.PharmaCare.pos_backend.enums.StockMovementType;
import com.PharmaCare.pos_backend.enums.UnitType;
import com.PharmaCare.pos_backend.model.Medicine;
import com.PharmaCare.pos_backend.model.MedicineUnit;
import com.PharmaCare.pos_backend.model.StockMovement;
import com.PharmaCare.pos_backend.model.User;
import com.PharmaCare.pos_backend.exception.ApiException;
import com.PharmaCare.pos_backend.exception.ResourceNotFoundException;
import com.PharmaCare.pos_backend.repository.StockMovementRepository;
import com.PharmaCare.pos_backend.repository.MedicineRepository;
import com.PharmaCare.pos_backend.repository.MedicineUnitRepository;
import com.PharmaCare.pos_backend.repository.UserRepository;
import lombok.Data;
import lombok.Builder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.modelmapper.ModelMapper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class StockService {

    private final StockMovementRepository stockMovementRepository;
    private final MedicineRepository medicineRepository;
    private final MedicineUnitRepository medicineUnitRepository;
    private final UserRepository userRepository;
    private final ModelMapper modelMapper;

    /**
     * GET /api/stock/movements - Main endpoint for stock movements
     */
    public PaginatedResponse<StockMovementResponse> getStockMovementsWithDates(
            int page, int limit, UUID medicineId,
            StockMovementType type,
            LocalDate startDate,
            LocalDate endDate) {

        try {
            Pageable pageable = PageRequest.of(page - 1, limit,
                    Sort.by(Sort.Direction.DESC, "createdAt"));

            LocalDateTime startDateTime = null;
            LocalDateTime endDateTime = null;

            if (startDate != null) {
                startDateTime = startDate.atStartOfDay();
            }

            if (endDate != null) {
                endDateTime = endDate.atTime(LocalTime.MAX);
            }

            log.debug("Fetching stock movements with filters: medicineId={}, type={}, startDate={}, endDate={}",
                    medicineId, type, startDateTime, endDateTime);

            Page<StockMovement> movementsPage = stockMovementRepository.findStockMovementsWithFilters(
                    medicineId, type, startDateTime, endDateTime, pageable);

            List<StockMovementResponse> movementResponses = movementsPage.getContent()
                    .stream()
                    .map(this::mapToStockMovementResponse)
                    .collect(Collectors.toList());

            log.debug("Found {} stock movements", movementsPage.getTotalElements());

            return PaginatedResponse.of(movementResponses, page, limit, movementsPage.getTotalElements());

        } catch (Exception e) {
            log.error("Error fetching stock movements with JPQL: {}", e.getMessage(), e);
            throw new ApiException("Failed to fetch stock movements. Please try again later.",
                    HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Simplified method for getting stock movements
     */
    public PaginatedResponse<StockMovementResponse> getStockMovements(
            int page, int limit, UUID medicineId, StockMovementType type) {
        return getStockMovementsWithDates(page, limit, medicineId, type, null, null);
    }

    /**
     * Get stock movements for monthly summary
     */
    public List<StockMovementResponse> getStockMovementsForMonthlySummary(
            UUID medicineId,
            StockMovementType type,
            LocalDateTime startDateTime,
            LocalDateTime endDateTime) {

        try {
            List<StockMovement> movements = stockMovementRepository.findAllStockMovementsWithFilters(
                    medicineId, type, startDateTime, endDateTime);

            return movements.stream()
                    .map(this::mapToStockMovementResponse)
                    .collect(Collectors.toList());

        } catch (Exception e) {
            log.error("Error fetching movements for monthly summary: {}", e.getMessage(), e);
            return Collections.emptyList();
        }
    }

    /**
     * Record stock loss
     */
    @Transactional
    public StockMovementResponse recordStockLoss(StockLossRequest request) {
        Medicine medicine = medicineRepository.findById(request.getMedicineId())
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", request.getMedicineId()));

        User performedBy = getCurrentUserFromContext();
        if (performedBy == null) {
            throw new ApiException("User not authenticated", HttpStatus.UNAUTHORIZED);
        }

        int previousStock = medicine.getStockQuantity();
        int newStock = previousStock - request.getQuantity();

        if (newStock < 0) {
            throw new ApiException("Cannot record loss greater than current stock",
                    HttpStatus.BAD_REQUEST);
        }

        medicine.setStockQuantity(newStock);
        medicineRepository.save(medicine);

        StockMovement stockMovement = StockMovement.builder()
                .medicine(medicine)
                .medicineName(medicine.getName())
                .type(StockMovementType.LOSS)
                .quantity(-request.getQuantity())
                .previousStock(previousStock)
                .newStock(newStock)
                .reason(request.getReason())
                .performedBy(performedBy)
                .performedByName(performedBy.getName())
                .performedByRole(performedBy.getRole())
                .createdAt(LocalDateTime.now())
                .build();

        StockMovement savedMovement = stockMovementRepository.save(stockMovement);
        log.info("Stock loss recorded for medicine {}: {} units. Reason: {}",
                medicine.getName(), request.getQuantity(), request.getReason());

        return mapToStockMovementResponse(savedMovement);
    }

    /**
     * Record stock adjustment
     */
    @Transactional
    public StockMovementResponse recordStockAdjustment(StockAdjustmentRequest request) {
        Medicine medicine = medicineRepository.findById(request.getMedicineId())
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", request.getMedicineId()));

        User performedBy = getCurrentUserFromContext();
        if (performedBy == null) {
            throw new ApiException("User not authenticated", HttpStatus.UNAUTHORIZED);
        }

        int previousStock = medicine.getStockQuantity();
        int newStock = previousStock + request.getQuantity();

        if (newStock < 0) {
            newStock = 0;
        }

        medicine.setStockQuantity(newStock);
        medicineRepository.save(medicine);

        StockMovement stockMovement = StockMovement.builder()
                .medicine(medicine)
                .medicineName(medicine.getName())
                .type(StockMovementType.ADJUSTMENT)
                .quantity(request.getQuantity())
                .previousStock(previousStock)
                .newStock(newStock)
                .reason(request.getReason())
                .performedBy(performedBy)
                .performedByName(performedBy.getName())
                .performedByRole(performedBy.getRole())
                .createdAt(LocalDateTime.now())
                .build();

        StockMovement savedMovement = stockMovementRepository.save(stockMovement);
        log.info("Stock adjustment recorded for medicine {}: {} units. New stock: {}. Reason: {}",
                medicine.getName(), request.getQuantity(), newStock, request.getReason());

        return mapToStockMovementResponse(savedMovement);
    }

    /**
     * Add stock (used for purchase orders)
     */
    @Transactional
    public StockMovementResponse addStock(UUID medicineId, StockAdditionRequest request) {
        Medicine medicine = medicineRepository.findById(medicineId)
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", medicineId));

        User performedBy = getCurrentUserFromContext();
        if (performedBy == null) {
            throw new ApiException("User not authenticated", HttpStatus.UNAUTHORIZED);
        }

        int previousStock = medicine.getStockQuantity();
        int newStock = previousStock + request.getQuantity();

        medicine.setStockQuantity(newStock);
        medicineRepository.save(medicine);

        UUID referenceId = null;
        if (request.getReferenceId() != null && !request.getReferenceId().trim().isEmpty()) {
            try {
                referenceId = UUID.fromString(request.getReferenceId());
            } catch (IllegalArgumentException e) {
                log.warn("Invalid referenceId format: {}", request.getReferenceId());
            }
        }

        StockMovement stockMovement = StockMovement.builder()
                .medicine(medicine)
                .medicineName(medicine.getName())
                .type(StockMovementType.PURCHASE)
                .quantity(request.getQuantity())
                .previousStock(previousStock)
                .newStock(newStock)
                .referenceId(referenceId)
                .performedBy(performedBy)
                .performedByName(performedBy.getName())
                .performedByRole(performedBy.getRole())
                .createdAt(LocalDateTime.now())
                .build();

        StockMovement savedMovement = stockMovementRepository.save(stockMovement);
        log.info("Stock added for medicine {}: {} units", medicine.getName(), request.getQuantity());

        return mapToStockMovementResponse(savedMovement);
    }

    /**
     * FIXED: Deduct stock CORRECTLY - No double deduction bug
     */
    @Transactional
    public StockMovementResponse deductStock(UUID medicineId, StockDeductionRequest request) {
        log.info("=== STARTING STOCK DEDUCTION ===");
        log.info("Medicine ID: {}, Quantity: {}, Unit Type: {}",
                medicineId, request.getQuantity(), request.getUnitType());

        // Get medicine
        Medicine medicine = medicineRepository.findById(medicineId)
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", medicineId));

        log.info("Medicine: {}, Current stock: {}", medicine.getName(), medicine.getStockQuantity());

        // Get user
        User performedBy;
        if (request.getPerformedById() != null && !request.getPerformedById().trim().isEmpty()) {
            performedBy = userRepository.findById(UUID.fromString(request.getPerformedById()))
                    .orElseThrow(() -> new ResourceNotFoundException("User", "id", request.getPerformedById()));
        } else {
            performedBy = getCurrentUserFromContext();
            if (performedBy == null) {
                throw new ApiException("User not authenticated", HttpStatus.UNAUTHORIZED);
            }
        }

        log.info("Performed by: {} (Role: {})", performedBy.getName(), performedBy.getRole());

        // FIXED: Calculate actual quantity CORRECTLY
        int actualQuantity = calculateActualQuantityForSale(medicine, request.getUnitType(), request.getQuantity());
        log.info("Quantity conversion: {} {} = {} tablets",
                request.getQuantity(), request.getUnitType(), actualQuantity);

        // Check stock
        if (medicine.getStockQuantity() < actualQuantity) {
            log.error("Insufficient stock! Available: {}, Required: {}",
                    medicine.getStockQuantity(), actualQuantity);
            throw new ApiException(String.format(
                    "Insufficient stock for %s. Available: %d, Requested: %d",
                    medicine.getName(), medicine.getStockQuantity(), actualQuantity),
                    HttpStatus.BAD_REQUEST);
        }

        // FIXED: Update stock correctly
        int previousStock = medicine.getStockQuantity();
        int newStock = previousStock - actualQuantity;

        log.info("Stock calculation: {} - {} = {}", previousStock, actualQuantity, newStock);

        // Update medicine stock
        medicine.setStockQuantity(newStock);
        medicineRepository.save(medicine);

        log.info("Stock updated. New stock: {}", medicine.getStockQuantity());

        // Parse referenceId
        UUID referenceId = null;
        if (request.getReferenceId() != null && !request.getReferenceId().trim().isEmpty()) {
            try {
                referenceId = UUID.fromString(request.getReferenceId());
            } catch (IllegalArgumentException e) {
                log.warn("Invalid referenceId: {}", request.getReferenceId());
            }
        }

        // Create stock movement
        StockMovement stockMovement = StockMovement.builder()
                .medicine(medicine)
                .medicineName(medicine.getName())
                .type(StockMovementType.SALE)
                .quantity(-actualQuantity)
                .previousStock(previousStock)
                .newStock(newStock)
                .referenceId(referenceId)
                .performedBy(performedBy)
                .performedByName(performedBy.getName())
                .performedByRole(performedBy.getRole())
                .createdAt(LocalDateTime.now())
                .build();

        StockMovement savedMovement = stockMovementRepository.save(stockMovement);

        log.info("=== STOCK DEDUCTION COMPLETE ===");
        log.info("Medicine: {}, Deducted: {}, Remaining: {}",
                medicine.getName(), actualQuantity, newStock);

        return mapToStockMovementResponse(savedMovement);
    }

    /**
     * FIXED: Correct quantity calculation
     */
    private int calculateActualQuantityForSale(Medicine medicine, String unitType, int quantity) {
        if (unitType == null || unitType.trim().isEmpty()) {
            return quantity; // Default to single units
        }

        String unitLower = unitType.toLowerCase().trim();
        log.debug("Calculating quantity for: {} {}, medicine: {}",
                quantity, unitType, medicine.getName());

        // Single units - 1:1 ratio
        if (isSingleUnit(unitLower)) {
            return quantity;
        }

        // Try to find unit configuration
        List<MedicineUnit> units = medicine.getUnits();
        for (MedicineUnit unit : units) {
            if (unit != null && unit.getType() != null) {
                String unitValue = unit.getType().getValue().toLowerCase();
                if (unitValue.equals(unitLower)) {
                    if (unit.getQuantity() > 0) {
                        return quantity * unit.getQuantity();
                    }
                }
            }
        }

        // Try enum conversion
        try {
            UnitType enumType = UnitType.fromString(unitType);
            Optional<MedicineUnit> foundUnits = medicineUnitRepository.findByMedicineAndType(medicine, enumType);
            if (!foundUnits.isEmpty()) {
                MedicineUnit unit = foundUnits.get();
                if (unit.getQuantity() > 0) {
                    return quantity * unit.getQuantity();
                }
            }
        } catch (Exception e) {
            log.debug("Enum conversion failed: {}", unitType);
        }

        // Default conversions
        return getDefaultConversion(unitLower, quantity);
    }

    private boolean isSingleUnit(String unitType) {
        return unitType.equals("tablet") || unitType.equals("tablets") ||
                unitType.equals("tab") || unitType.equals("tabs") ||
                unitType.equals("pill") || unitType.equals("pills") ||
                unitType.equals("capsule") || unitType.equals("capsules") ||
                unitType.equals("unit") || unitType.equals("units") ||
                unitType.equals("single") || unitType.equals("singles") ||
                unitType.equals("piece") || unitType.equals("pieces") ||
                unitType.equals("each") || unitType.equals("item") || unitType.equals("items");
    }

    private int getDefaultConversion(String unitType, int quantity) {
        switch (unitType) {
            case "strip":
            case "strips":
                return quantity * 10;
            case "box":
            case "boxes":
                return quantity * 100;
            case "pack":
            case "packs":
                return quantity * 30;
            case "bottle":
            case "bottles":
                return quantity;
            case "vial":
            case "vials":
                return quantity;
            default:
                log.warn("Unknown unit type: {}, treating as single", unitType);
                return quantity;
        }
    }

    /**
     * Helper to get current user
     */
    private User getCurrentUserFromContext() {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            if (authentication != null && authentication.isAuthenticated() &&
                    !(authentication.getPrincipal() instanceof String &&
                            "anonymousUser".equals(authentication.getPrincipal()))) {

                String username = authentication.getName();
                return userRepository.findByEmail(username)
                        .orElseThrow(() -> new ApiException("User not found", HttpStatus.INTERNAL_SERVER_ERROR));
            }
        } catch (Exception e) {
            log.warn("Could not get current user: {}", e.getMessage());
        }
        return null;
    }

    /**
     * Get stock breakdown for UI
     */
    public List<StockBreakdownResponse> getStockBreakdown() {
        List<Medicine> medicines = medicineRepository.findByActiveTrue();
        List<StockBreakdownResponse> breakdowns = new ArrayList<>();

        for (Medicine medicine : medicines) {
            int totalTablets = medicine.getStockQuantity();
            int[] breakdown = calculateBreakdown(medicine, totalTablets);

            BigDecimal pricePerTablet = getSellingPricePerTablet(medicine);
            BigDecimal openValue = pricePerTablet.multiply(BigDecimal.valueOf(totalTablets));

            StockBreakdownResponse response = StockBreakdownResponse.builder()
                    .medicineId(medicine.getId())
                    .medicineName(medicine.getName())
                    .costPerBox(medicine.getCostPrice())
                    .tabs(breakdown[0])
                    .strips(breakdown[1])
                    .boxes(breakdown[2])
                    .openValue(openValue)
                    .sold(BigDecimal.ZERO)
                    .cogs(BigDecimal.ZERO)
                    .closeTabs(breakdown[0])
                    .closeStrips(breakdown[1])
                    .closeBoxes(breakdown[2])
                    .closeValue(openValue)
                    .variance(BigDecimal.ZERO)
                    .missing(0)
                    .status("OK")
                    .build();

            breakdowns.add(response);
        }

        return breakdowns;
    }

    /**
     * Calculate breakdown into tabs, strips, boxes
     */
    private int[] calculateBreakdown(Medicine medicine, int totalTablets) {
        int tabletsPerStrip = 10;
        int tabletsPerBox = 100;

        for (MedicineUnit unit : medicine.getUnits()) {
            if (unit.getType() == UnitType.STRIP) {
                tabletsPerStrip = unit.getQuantity();
            } else if (unit.getType() == UnitType.BOX) {
                tabletsPerBox = unit.getQuantity();
            }
        }

        int boxes = totalTablets / tabletsPerBox;
        int remainingAfterBoxes = totalTablets % tabletsPerBox;
        int strips = remainingAfterBoxes / tabletsPerStrip;
        int tabs = remainingAfterBoxes % tabletsPerStrip;

        return new int[]{tabs, strips, boxes};
    }

    private BigDecimal getSellingPricePerTablet(Medicine medicine) {
        for (MedicineUnit unit : medicine.getUnits()) {
            if (unit.getType() == UnitType.SINGLE || unit.getType() == UnitType.TABLETS) {
                if (unit.getQuantity() > 0) {
                    return unit.getPrice().divide(BigDecimal.valueOf(unit.getQuantity()), 4, RoundingMode.HALF_UP);
                }
            }
        }

        if (!medicine.getUnits().isEmpty()) {
            MedicineUnit unit = medicine.getUnits().get(0);
            if (unit.getQuantity() > 0) {
                return unit.getPrice().divide(BigDecimal.valueOf(unit.getQuantity()), 4, RoundingMode.HALF_UP);
            }
        }

        return BigDecimal.ZERO;
    }

    /**
     * Get stock movements by reference
     */
    public List<StockMovementResponse> getStockMovementsByReference(UUID referenceId) {
        try {
            List<StockMovement> movements = stockMovementRepository.findByReferenceId(referenceId);
            return movements.stream()
                    .map(this::mapToStockMovementResponse)
                    .collect(Collectors.toList());
        } catch (Exception e) {
            log.error("Error fetching movements by reference: {}", e.getMessage(), e);
            return Collections.emptyList();
        }
    }

    /**
     * Get net movement for period
     */
    public Integer getNetMovementForPeriod(UUID medicineId, LocalDateTime startDate, LocalDateTime endDate) {
        try {
            return stockMovementRepository.getNetMovementForPeriod(medicineId, startDate, endDate);
        } catch (Exception e) {
            log.error("Error calculating net movement: {}", e.getMessage(), e);
            return 0;
        }
    }

    /**
     * Get summary statistics for a period
     */
    public StockSummaryResponse getStockSummaryForPeriod(LocalDate startDate, LocalDate endDate) {
        try {
            LocalDateTime startDateTime = startDate != null ?
                    startDate.atStartOfDay() : LocalDate.now().withDayOfMonth(1).atStartOfDay();
            LocalDateTime endDateTime = endDate != null ?
                    endDate.atTime(LocalTime.MAX) : LocalDate.now().atTime(LocalTime.MAX);

            long salesCount = stockMovementRepository.countByTypeAndDateRange(
                    StockMovementType.SALE, startDateTime, endDateTime);
            int salesQuantity = Math.abs(stockMovementRepository.sumQuantityByTypeAndDateRange(
                    StockMovementType.SALE, startDateTime, endDateTime));

            long purchasesCount = stockMovementRepository.countByTypeAndDateRange(
                    StockMovementType.PURCHASE, startDateTime, endDateTime);
            int purchasesQuantity = stockMovementRepository.sumQuantityByTypeAndDateRange(
                    StockMovementType.PURCHASE, startDateTime, endDateTime);

            long adjustmentsCount = stockMovementRepository.countByTypeAndDateRange(
                    StockMovementType.ADJUSTMENT, startDateTime, endDateTime);
            int adjustmentsQuantity = stockMovementRepository.sumQuantityByTypeAndDateRange(
                    StockMovementType.ADJUSTMENT, startDateTime, endDateTime);

            long lossesCount = stockMovementRepository.countByTypeAndDateRange(
                    StockMovementType.LOSS, startDateTime, endDateTime);
            int lossesQuantity = Math.abs(stockMovementRepository.sumQuantityByTypeAndDateRange(
                    StockMovementType.LOSS, startDateTime, endDateTime));

            int netQuantity = purchasesQuantity + adjustmentsQuantity - salesQuantity - lossesQuantity;

            return StockSummaryResponse.builder()
                    .startDate(startDateTime.toLocalDate())
                    .endDate(endDateTime.toLocalDate())
                    .salesCount(salesCount)
                    .salesQuantity(salesQuantity)
                    .purchasesCount(purchasesCount)
                    .purchasesQuantity(purchasesQuantity)
                    .adjustmentsCount(adjustmentsCount)
                    .adjustmentsQuantity(adjustmentsQuantity)
                    .lossesCount(lossesCount)
                    .lossesQuantity(lossesQuantity)
                    .netQuantity(netQuantity)
                    .build();

        } catch (Exception e) {
            log.error("Error generating stock summary: {}", e.getMessage(), e);
            throw new ApiException("Failed to generate stock summary", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get stock movements for a specific medicine
     */
    public PaginatedResponse<StockMovementResponse> getStockMovementsByMedicine(
            UUID medicineId, int page, int limit) {

        Pageable pageable = PageRequest.of(page - 1, limit,
                Sort.by(Sort.Direction.DESC, "createdAt"));

        try {
            Page<StockMovement> stockMovements = stockMovementRepository
                    .findByMedicineIdOrderByCreatedAtDesc(medicineId, pageable);

            List<StockMovementResponse> responses = stockMovements.getContent()
                    .stream()
                    .map(this::mapToStockMovementResponse)
                    .collect(Collectors.toList());

            return PaginatedResponse.of(
                    responses, page, limit, stockMovements.getTotalElements());

        } catch (Exception e) {
            log.error("Error fetching stock movements for medicine {}: {}",
                    medicineId, e.getMessage(), e);
            throw new ApiException("Failed to fetch stock movements",
                    HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get recent stock movements
     */
    public List<StockMovementResponse> getRecentStockMovements(int limit) {
        try {
            Pageable pageable = PageRequest.of(0, limit,
                    Sort.by(Sort.Direction.DESC, "createdAt"));

            Page<StockMovement> recentMovements = stockMovementRepository
                    .findAll(pageable);

            return recentMovements.getContent()
                    .stream()
                    .map(this::mapToStockMovementResponse)
                    .collect(Collectors.toList());

        } catch (Exception e) {
            log.error("Error fetching recent stock movements: {}", e.getMessage(), e);
            throw new ApiException("Failed to fetch recent stock movements",
                    HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Delete a stock movement
     */
    @Transactional
    public void deleteStockMovement(UUID id) {
        try {
            if (!stockMovementRepository.existsById(id)) {
                throw new ApiException("Stock movement not found", HttpStatus.NOT_FOUND);
            }

            stockMovementRepository.deleteById(id);
            log.info("Stock movement deleted: {}", id);

        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            log.error("Error deleting stock movement {}: {}", id, e.getMessage(), e);
            throw new ApiException("Failed to delete stock movement",
                    HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Helper method to map StockMovement to StockMovementResponse
     */
    private StockMovementResponse mapToStockMovementResponse(StockMovement stockMovement) {
        try {
            StockMovementResponse response = modelMapper.map(stockMovement, StockMovementResponse.class);

            if (stockMovement.getMedicine() != null) {
                response.setMedicineId(stockMovement.getMedicine().getId());
                response.setMedicineName(stockMovement.getMedicine().getName());
            }

            if (stockMovement.getPerformedBy() != null) {
                response.setPerformedById(stockMovement.getPerformedBy().getId());
                response.setPerformedByName(stockMovement.getPerformedByName());
                response.setPerformedByRole(stockMovement.getPerformedByRole());
            }

            return response;
        } catch (Exception e) {
            log.error("Error mapping stock movement: {}", e.getMessage(), e);
            StockMovementResponse response = new StockMovementResponse();
            response.setId(stockMovement.getId());
            response.setMedicineName(stockMovement.getMedicineName());
            response.setType(stockMovement.getType());
            response.setQuantity(stockMovement.getQuantity());
            response.setPreviousStock(stockMovement.getPreviousStock());
            response.setNewStock(stockMovement.getNewStock());
            response.setCreatedAt(stockMovement.getCreatedAt());
            response.setPerformedByName(stockMovement.getPerformedByName());
            response.setPerformedByRole(stockMovement.getPerformedByRole());

            if (stockMovement.getPerformedBy() != null) {
                response.setPerformedById(stockMovement.getPerformedBy().getId());
            }

            return response;
        }
    }

    /**
     * DTO for stock breakdown response
     */
    @Data
    @Builder
    public static class StockBreakdownResponse {
        private UUID medicineId;
        private String medicineName;
        private BigDecimal costPerBox;
        private int tabs;
        private int strips;
        private int boxes;
        private BigDecimal openValue;
        private BigDecimal sold;
        private BigDecimal cogs;
        private int closeTabs;
        private int closeStrips;
        private int closeBoxes;
        private BigDecimal closeValue;
        private BigDecimal variance;
        private int missing;
        private String status;
    }
}