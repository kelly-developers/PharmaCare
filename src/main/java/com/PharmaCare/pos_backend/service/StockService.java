package com.PharmaCare.pos_backend.service;

import com.PharmaCare.pos_backend.dto.request.StockAdditionRequest;
import com.PharmaCare.pos_backend.dto.request.StockAdjustmentRequest;
import com.PharmaCare.pos_backend.dto.request.StockDeductionRequest;
import com.PharmaCare.pos_backend.dto.request.StockLossRequest;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.StockMovementResponse;
import com.PharmaCare.pos_backend.enums.Role;
import com.PharmaCare.pos_backend.enums.StockMovementType;
import com.PharmaCare.pos_backend.enums.UnitType;
import com.PharmaCare.pos_backend.model.Medicine;
import com.PharmaCare.pos_backend.model.StockMovement;
import com.PharmaCare.pos_backend.model.User;
import com.PharmaCare.pos_backend.exception.ResourceNotFoundException;
import com.PharmaCare.pos_backend.repository.StockMovementRepository;
import com.PharmaCare.pos_backend.repository.MedicineRepository;
import com.PharmaCare.pos_backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.modelmapper.ModelMapper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class StockService {

    private final StockMovementRepository stockMovementRepository;
    private final MedicineRepository medicineRepository;
    private final UserRepository userRepository;
    private final ModelMapper modelMapper;

    /**
     * Main method for getting stock movements with filters
     */
    public PaginatedResponse<StockMovementResponse> getStockMovementsWithDates(
            int page, int limit, UUID medicineId,
            StockMovementType type,
            LocalDate startDate,
            LocalDate endDate) {

        try {
            int offset = (page - 1) * limit;
            LocalDateTime startDateTime = startDate != null ? startDate.atStartOfDay() : null;
            LocalDateTime endDateTime = endDate != null ? endDate.atTime(23, 59, 59) : null;
            String typeStr = type != null ? type.name() : null;

            long totalElements = stockMovementRepository.countStockMovementsWithFilters(
                    medicineId, typeStr, startDateTime, endDateTime);

            List<StockMovement> movements = stockMovementRepository.findStockMovementsWithFiltersNative(
                    medicineId, typeStr, startDateTime, endDateTime, offset, limit);

            List<StockMovementResponse> movementResponses = movements.stream()
                    .map(this::mapToStockMovementResponse)
                    .collect(Collectors.toList());

            return PaginatedResponse.of(movementResponses, page, limit, totalElements);

        } catch (Exception e) {
            log.error("Error fetching stock movements: {}", e.getMessage(), e);
            try {
                return getStockMovementsWithFiltersFallback(page, limit, medicineId, type, startDate, endDate);
            } catch (Exception ex) {
                log.error("Fallback also failed: {}", ex.getMessage(), ex);
                return PaginatedResponse.empty(page, limit);
            }
        }
    }

    /**
     * Fallback method using JPQL if native query fails
     */
    private PaginatedResponse<StockMovementResponse> getStockMovementsWithFiltersFallback(
            int page, int limit, UUID medicineId,
            StockMovementType type,
            LocalDate startDate,
            LocalDate endDate) {

        Pageable pageable = PageRequest.of(page - 1, limit, Sort.by("createdAt").descending());
        LocalDateTime startDateTime = startDate != null ? startDate.atStartOfDay() : null;
        LocalDateTime endDateTime = endDate != null ? endDate.atTime(23, 59, 59) : null;

        Page<StockMovement> movementsPage = stockMovementRepository.findStockMovementsWithFilters(
                medicineId, type, startDateTime, endDateTime, pageable);

        List<StockMovementResponse> movementResponses = movementsPage.getContent()
                .stream()
                .map(this::mapToStockMovementResponse)
                .collect(Collectors.toList());

        return PaginatedResponse.of(movementResponses, page, limit, movementsPage.getTotalElements());
    }

    /**
     * Method for monthly summary without pagination
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
     * Simplified method for getting stock movements (for backward compatibility)
     */
    public PaginatedResponse<StockMovementResponse> getStockMovements(
            int page, int limit, UUID medicineId, StockMovementType type) {
        return getStockMovementsWithDates(page, limit, medicineId, type, null, null);
    }

    /**
     * Record stock loss
     */
    @Transactional
    public StockMovementResponse recordStockLoss(StockLossRequest request) {
        Medicine medicine = medicineRepository.findById(request.getMedicineId())
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", request.getMedicineId()));

        // Convert String to UUID for performedBy
        UUID performedById = UUID.fromString(request.getPerformedBy());
        User performedBy = userRepository.findById(performedById)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", performedById));

        int previousStock = medicine.getStockQuantity();
        int newStock = previousStock - request.getQuantity();

        if (newStock < 0) {
            newStock = 0;
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
                .performedByRole(Role.valueOf(request.getPerformedByRole()))
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

        // Convert String to UUID for performedBy
        UUID performedById = UUID.fromString(request.getPerformedBy());
        User performedBy = userRepository.findById(performedById)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", performedById));

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
                .performedByRole(Role.valueOf(request.getPerformedByRole()))
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

        // Convert String to UUID for performedBy
        UUID performedById = UUID.fromString(request.getPerformedBy());
        User performedBy = userRepository.findById(performedById)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", performedById));

        int previousStock = medicine.getStockQuantity();
        int newStock = previousStock + request.getQuantity();

        medicine.setStockQuantity(newStock);
        medicineRepository.save(medicine);

        StockMovement stockMovement = StockMovement.builder()
                .medicine(medicine)
                .medicineName(medicine.getName())
                .type(StockMovementType.PURCHASE)
                .quantity(request.getQuantity())
                .previousStock(previousStock)
                .newStock(newStock)
                .referenceId(UUID.fromString(request.getReferenceId()))
                .performedBy(performedBy)
                .performedByName(performedBy.getName())
                .performedByRole(Role.valueOf(request.getPerformedByRole()))
                .createdAt(LocalDateTime.now())
                .build();

        StockMovement savedMovement = stockMovementRepository.save(stockMovement);
        log.info("Stock added for medicine {}: {} units", medicine.getName(), request.getQuantity());

        return mapToStockMovementResponse(savedMovement);
    }

    /**
     * Deduct stock (used for sales) - FIXED VERSION
     */
    @Transactional
    public void deductStock(UUID medicineId, StockDeductionRequest request) {
        Medicine medicine = medicineRepository.findById(medicineId)
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", medicineId));

        // Convert String performedById to UUID
        UUID performedById;
        try {
            performedById = UUID.fromString(request.getPerformedById());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid performedById format: " + request.getPerformedById());
        }

        User performedBy = userRepository.findById(performedById)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", performedById));

        int previousStock = medicine.getStockQuantity();
        int quantityToDeduct = request.getQuantity();

        // Convert unit types to single units if needed
        if (request.getUnitType() != null && !"single".equalsIgnoreCase(request.getUnitType())) {
            try {
                quantityToDeduct = convertToSingleUnits(request.getQuantity(), request.getUnitType());
            } catch (Exception e) {
                log.warn("Invalid unit type: {}, using quantity as-is", request.getUnitType());
            }
        }

        int newStock = previousStock - quantityToDeduct;

        if (newStock < 0) {
            throw new IllegalArgumentException("Insufficient stock for medicine: " + medicine.getName() +
                    ". Available: " + previousStock + ", Requested: " + quantityToDeduct);
        }

        medicine.setStockQuantity(newStock);
        medicineRepository.save(medicine);

        StockMovement stockMovement = StockMovement.builder()
                .medicine(medicine)
                .medicineName(medicine.getName())
                .type(StockMovementType.SALE)
                .quantity(-quantityToDeduct)
                .previousStock(previousStock)
                .newStock(newStock)
                .referenceId(UUID.fromString(request.getReferenceId())) // String
                .performedBy(performedBy)
                .performedByName(performedBy.getName())
                .performedByRole(Role.valueOf(request.getRole()))
                .createdAt(LocalDateTime.now())
                .build();

        stockMovementRepository.save(stockMovement);
        log.info("Stock deducted for medicine {}: {} units",
                medicine.getName(), quantityToDeduct);
    }

    /**
     * Helper method to convert different unit types to single units
     */
    private int convertToSingleUnits(int quantity, String unitType) {
        switch (unitType.toLowerCase()) {
            case "single":
                return quantity;
            case "strip":
                return quantity * 10;
            case "box":
                return quantity * 100;
            case "pair":
                return quantity * 2;
            case "bottle":
                return quantity;
            default:
                return quantity;
        }
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
    public Map<String, Object> getStockSummaryForPeriod(LocalDate startDate, LocalDate endDate) {
        try {
            LocalDateTime startDateTime = startDate.atStartOfDay();
            LocalDateTime endDateTime = endDate.atTime(23, 59, 59);

            Map<String, Object> summary = new HashMap<>();

            for (StockMovementType type : StockMovementType.values()) {
                long count = stockMovementRepository.countByTypeAndDateRange(type, startDateTime, endDateTime);
                int quantity = stockMovementRepository.sumQuantityByTypeAndDateRange(type, startDateTime, endDateTime);

                summary.put(type.name().toLowerCase() + "_count", count);
                summary.put(type.name().toLowerCase() + "_quantity", Math.abs(quantity));
            }

            return summary;
        } catch (Exception e) {
            log.error("Error generating stock summary: {}", e.getMessage(), e);
            return Collections.emptyMap();
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
            }

            return response;
        } catch (Exception e) {
            log.error("Error mapping stock movement: {}", e.getMessage(), e);
            StockMovementResponse response = new StockMovementResponse();
            response.setId(stockMovement.getId());
            response.setMedicineName(stockMovement.getMedicineName());
            response.setType(stockMovement.getType());
            response.setQuantity(stockMovement.getQuantity());
            response.setCreatedAt(stockMovement.getCreatedAt());
            return response;
        }
    }
}