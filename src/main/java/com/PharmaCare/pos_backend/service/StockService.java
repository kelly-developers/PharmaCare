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

import java.time.LocalDateTime;
import java.util.List;
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

    public PaginatedResponse<StockMovementResponse> getStockMovements(int page, int limit, UUID medicineId,
                                                                      StockMovementType type,
                                                                      LocalDateTime startDate,
                                                                      LocalDateTime endDate) {
        Pageable pageable = PageRequest.of(page - 1, limit, Sort.by("createdAt").descending());

        Page<StockMovement> movementsPage = stockMovementRepository.findStockMovements(
                medicineId, type, startDate, endDate, pageable);

        List<StockMovementResponse> movementResponses = movementsPage.getContent()
                .stream()
                .map(this::mapToStockMovementResponse)
                .collect(Collectors.toList());

        return PaginatedResponse.of(movementResponses, page, limit, movementsPage.getTotalElements());
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

        // Update medicine stock
        medicine.setStockQuantity(newStock);
        medicineRepository.save(medicine);

        // Create stock movement record
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

        // Update medicine stock
        medicine.setStockQuantity(newStock);
        medicineRepository.save(medicine);

        // Create stock movement record
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

        // Update medicine stock
        medicine.setStockQuantity(newStock);
        medicineRepository.save(medicine);

        // Create stock movement record
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

        // Update medicine stock
        medicine.setStockQuantity(newStock);
        medicineRepository.save(medicine);

        // Create stock movement record
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

    private StockMovementResponse mapToStockMovementResponse(StockMovement stockMovement) {
        StockMovementResponse response = modelMapper.map(stockMovement, StockMovementResponse.class);

        if (stockMovement.getMedicine() != null) {
            response.setMedicineId(stockMovement.getMedicine().getId());
        }

        return response;
    }
}