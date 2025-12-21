package com.PharmaCare.pos_backend.service;

import com.PharmaCare.pos_backend.dto.request.StockAdditionRequest;
import com.PharmaCare.pos_backend.dto.request.StockAdjustmentRequest;
import com.PharmaCare.pos_backend.dto.request.StockDeductionRequest;
import com.PharmaCare.pos_backend.dto.request.StockLossRequest;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.StockMovementResponse;
import com.PharmaCare.pos_backend.enums.Role;
import com.PharmaCare.pos_backend.enums.StockMovementType;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class StockService {

    private final StockMovementRepository stockMovementRepository;
    private final MedicineRepository medicineRepository;
    private final UserRepository userRepository;
    private final ModelMapper modelMapper;

    // FIXED: This method now handles LocalDate parameters correctly
    public PaginatedResponse<StockMovementResponse> getStockMovementsWithDates(
            int page, int limit, UUID medicineId,
            StockMovementType type,
            LocalDate startDate,
            LocalDate endDate) {

        Pageable pageable = PageRequest.of(page - 1, limit, Sort.by("createdAt").descending());

        // Convert LocalDate to LocalDateTime for proper query
        LocalDateTime startDateTime = startDate != null ? startDate.atStartOfDay() : null;
        LocalDateTime endDateTime = endDate != null ? endDate.atTime(23, 59, 59) : null;

        // Use the repository method that handles LocalDateTime
        Page<StockMovement> movementsPage = stockMovementRepository.findStockMovementsWithDateTime(
                medicineId, type, startDateTime, endDateTime, pageable);

        List<StockMovementResponse> movementResponses = movementsPage.getContent()
                .stream()
                .map(this::mapToStockMovementResponse)
                .collect(Collectors.toList());

        return PaginatedResponse.of(movementResponses, page, limit, movementsPage.getTotalElements());
    }

    // NEW: Method specifically for monthly summary without pagination
    public List<StockMovementResponse> getStockMovementsForMonthlySummary(
            UUID medicineId,
            StockMovementType type,
            LocalDateTime startDateTime,
            LocalDateTime endDateTime) {

        // Use a large page size to get all records
        Pageable pageable = PageRequest.of(0, 1000, Sort.by("createdAt").descending());

        Page<StockMovement> movementsPage = stockMovementRepository.findStockMovementsWithDateTime(
                medicineId, type, startDateTime, endDateTime, pageable);

        return movementsPage.getContent()
                .stream()
                .map(this::mapToStockMovementResponse)
                .collect(Collectors.toList());
    }

    public PaginatedResponse<StockMovementResponse> getStockMovementsWithDateTimes(
            int page, int limit, UUID medicineId,
            StockMovementType type,
            LocalDateTime startDateTime,
            LocalDateTime endDateTime) {

        Pageable pageable = PageRequest.of(page - 1, limit, Sort.by("createdAt").descending());

        Page<StockMovement> movementsPage = stockMovementRepository.findStockMovementsWithDateTime(
                medicineId, type, startDateTime, endDateTime, pageable);

        List<StockMovementResponse> movementResponses = movementsPage.getContent()
                .stream()
                .map(this::mapToStockMovementResponse)
                .collect(Collectors.toList());

        return PaginatedResponse.of(movementResponses, page, limit, movementsPage.getTotalElements());
    }

    public PaginatedResponse<StockMovementResponse> getStockMovements(
            int page, int limit, UUID medicineId, StockMovementType type) {
        return getStockMovementsWithDates(page, limit, medicineId, type, null, null);
    }

    @Transactional
    public StockMovementResponse recordStockLoss(StockLossRequest request) {
        Medicine medicine = medicineRepository.findById(request.getMedicineId())
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", request.getMedicineId()));

        User performedBy = userRepository.findById(request.getPerformedBy())
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", request.getPerformedBy()));

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

    @Transactional
    public StockMovementResponse recordStockAdjustment(StockAdjustmentRequest request) {
        Medicine medicine = medicineRepository.findById(request.getMedicineId())
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", request.getMedicineId()));

        User performedBy = userRepository.findById(request.getPerformedBy())
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", request.getPerformedBy()));

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

    @Transactional
    public StockMovementResponse deductStock(UUID medicineId, StockDeductionRequest request) {
        Medicine medicine = medicineRepository.findById(medicineId)
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", medicineId));

        User performedBy = userRepository.findById(request.getPerformedBy())
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", request.getPerformedBy()));

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
                .type(StockMovementType.SALE)
                .quantity(-request.getQuantity())
                .previousStock(previousStock)
                .newStock(newStock)
                .referenceId(request.getReferenceId())
                .performedBy(performedBy)
                .performedByName(performedBy.getName())
                .performedByRole(Role.valueOf(request.getPerformedByRole()))
                .createdAt(LocalDateTime.now())
                .build();

        StockMovement savedMovement = stockMovementRepository.save(stockMovement);
        log.info("Stock deducted for medicine {}: {} units", medicine.getName(), request.getQuantity());

        return mapToStockMovementResponse(savedMovement);
    }

    @Transactional
    public StockMovementResponse addStock(UUID medicineId, StockAdditionRequest request) {
        Medicine medicine = medicineRepository.findById(medicineId)
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", medicineId));

        User performedBy = userRepository.findById(request.getPerformedBy())
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", request.getPerformedBy()));

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
                .referenceId(request.getReferenceId())
                .performedBy(performedBy)
                .performedByName(performedBy.getName())
                .performedByRole(Role.valueOf(request.getPerformedByRole()))
                .createdAt(LocalDateTime.now())
                .build();

        StockMovement savedMovement = stockMovementRepository.save(stockMovement);
        log.info("Stock added for medicine {}: {} units", medicine.getName(), request.getQuantity());

        return mapToStockMovementResponse(savedMovement);
    }

    public List<StockMovementResponse> getStockMovementsByMedicine(UUID medicineId) {
        Medicine medicine = medicineRepository.findById(medicineId)
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", medicineId));

        Page<StockMovement> movementsPage = stockMovementRepository.findByMedicine(
                medicine, PageRequest.of(0, 100, Sort.by("createdAt").descending()));

        return movementsPage.getContent()
                .stream()
                .map(this::mapToStockMovementResponse)
                .collect(Collectors.toList());
    }

    public List<StockMovementResponse> getStockMovementsByReference(UUID referenceId) {
        List<StockMovement> movements = stockMovementRepository.findByReferenceId(referenceId);
        return movements.stream()
                .map(this::mapToStockMovementResponse)
                .collect(Collectors.toList());
    }

    public Integer getNetMovementForPeriod(UUID medicineId, LocalDateTime startDate, LocalDateTime endDate) {
        return stockMovementRepository.getNetMovementForPeriod(medicineId, startDate, endDate);
    }

    // NEW: Get summary statistics for a period
    public Map<String, Object> getStockSummaryForPeriod(LocalDate startDate, LocalDate endDate) {
        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.atTime(23, 59, 59);

        Map<String, Object> summary = new HashMap<>();

        // Get counts for each movement type
        for (StockMovementType type : StockMovementType.values()) {
            long count = stockMovementRepository.countByTypeAndDateRange(type, startDateTime, endDateTime);
            int quantity = stockMovementRepository.sumQuantityByTypeAndDateRange(type, startDateTime, endDateTime);

            summary.put(type.name().toLowerCase() + "_count", count);
            summary.put(type.name().toLowerCase() + "_quantity", quantity);
        }

        return summary;
    }

    private StockMovementResponse mapToStockMovementResponse(StockMovement stockMovement) {
        StockMovementResponse response = modelMapper.map(stockMovement, StockMovementResponse.class);

        if (stockMovement.getMedicine() != null) {
            response.setMedicineId(stockMovement.getMedicine().getId());
        }

        return response;
    }
}