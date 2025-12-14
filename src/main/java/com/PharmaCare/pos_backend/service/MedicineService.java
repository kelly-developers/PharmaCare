package com.PharmaCare.pos_backend.service;

import com.PharmaCare.pos_backend.dto.request.MedicineRequest;
import com.PharmaCare.pos_backend.dto.request.StockAdditionRequest;
import com.PharmaCare.pos_backend.dto.request.StockDeductionRequest;
import com.PharmaCare.pos_backend.dto.response.MedicineResponse;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.StockMovementResponse;
import com.PharmaCare.pos_backend.enums.Role;
import com.PharmaCare.pos_backend.enums.StockMovementType;
import com.PharmaCare.pos_backend.enums.UnitType;
import com.PharmaCare.pos_backend.model.*;
import com.PharmaCare.pos_backend.exception.ApiException;
import com.PharmaCare.pos_backend.exception.InsufficientStockException;
import com.PharmaCare.pos_backend.exception.ResourceNotFoundException;
import com.PharmaCare.pos_backend.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.modelmapper.ModelMapper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class MedicineService {

    private final MedicineRepository medicineRepository;
    private final MedicineUnitRepository medicineUnitRepository;
    private final CategoryRepository categoryRepository;
    private final SupplierRepository supplierRepository;
    private final StockMovementRepository stockMovementRepository;
    private final UserRepository userRepository;
    private final ModelMapper modelMapper;

    public MedicineResponse getMedicineById(UUID id) {
        Medicine medicine = medicineRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", id));
        return mapToMedicineResponse(medicine);
    }

    public PaginatedResponse<MedicineResponse> getAllMedicines(int page, int limit, String search, String category,
                                                               Boolean lowStock, Boolean expiringSoon) {
        Pageable pageable = PageRequest.of(page - 1, limit, Sort.by("name").ascending());

        Page<Medicine> medicinePage;

        if (lowStock != null && lowStock) {
            medicinePage = medicineRepository.findLowStockItems(pageable);
        } else if (expiringSoon != null && expiringSoon) {
            LocalDate expiryThreshold = LocalDate.now().plusDays(90);
            medicinePage = medicineRepository.findExpiringItems(expiryThreshold, pageable);
        } else {
            medicinePage = medicineRepository.searchMedicines(search, category, pageable);
        }

        List<MedicineResponse> medicineResponses = medicinePage.getContent()
                .stream()
                .map(this::mapToMedicineResponse)
                .collect(Collectors.toList());

        return PaginatedResponse.of(medicineResponses, page, limit, medicinePage.getTotalElements());
    }

    @Transactional
    public MedicineResponse createMedicine(MedicineRequest request) {
        // Check if batch number already exists
        if (medicineRepository.existsByBatchNumber(request.getBatchNumber())) {
            throw new ApiException("Batch number already exists", HttpStatus.BAD_REQUEST);
        }

        // Validate expiry date
        if (request.getExpiryDate().isBefore(LocalDate.now())) {
            throw new ApiException("Medicine has expired", HttpStatus.BAD_REQUEST);
        }

        Medicine medicine = Medicine.builder()
                .name(request.getName())
                .genericName(request.getGenericName())
                .category(request.getCategory())
                .manufacturer(request.getManufacturer())
                .batchNumber(request.getBatchNumber())
                .expiryDate(request.getExpiryDate())
                .stockQuantity(request.getStockQuantity())
                .reorderLevel(request.getReorderLevel())
                .costPrice(request.getCostPrice())
                .imageUrl(request.getImageUrl())
                .isActive(true)
                .build();

        // Set supplier if provided
        if (request.getSupplierId() != null) {
            Supplier supplier = supplierRepository.findById(request.getSupplierId())
                    .orElseThrow(() -> new ResourceNotFoundException("Supplier", "id", request.getSupplierId()));
            medicine.setSupplier(supplier);
        }

        Medicine savedMedicine = medicineRepository.save(medicine);

        // Save medicine units
        List<MedicineUnit> units = new ArrayList<>();
        for (MedicineRequest.UnitRequest unitRequest : request.getUnits()) {
            MedicineUnit unit = MedicineUnit.builder()
                    .medicine(savedMedicine)
                    .type(UnitType.fromString(unitRequest.getType()))
                    .quantity(unitRequest.getQuantity())
                    .price(unitRequest.getPrice())
                    .build();
            units.add(unit);
        }
        medicineUnitRepository.saveAll(units);
        savedMedicine.setUnits(units);

        // Update category count
        updateCategoryCount(request.getCategory(), true);

        log.info("Medicine created with ID: {}", savedMedicine.getId());
        return mapToMedicineResponse(savedMedicine);
    }

    @Transactional
    public MedicineResponse updateMedicine(UUID id, MedicineRequest request) {
        Medicine medicine = medicineRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", id));

        // Check if batch number is being changed and if new batch number already exists
        if (!medicine.getBatchNumber().equals(request.getBatchNumber()) &&
                medicineRepository.existsByBatchNumber(request.getBatchNumber())) {
            throw new ApiException("Batch number already exists", HttpStatus.BAD_REQUEST);
        }

        // Update category count if category changed
        if (!medicine.getCategory().equals(request.getCategory())) {
            updateCategoryCount(medicine.getCategory(), false);
            updateCategoryCount(request.getCategory(), true);
        }

        medicine.setName(request.getName());
        medicine.setGenericName(request.getGenericName());
        medicine.setCategory(request.getCategory());
        medicine.setManufacturer(request.getManufacturer());
        medicine.setBatchNumber(request.getBatchNumber());
        medicine.setExpiryDate(request.getExpiryDate());
        medicine.setReorderLevel(request.getReorderLevel());
        medicine.setCostPrice(request.getCostPrice());
        medicine.setImageUrl(request.getImageUrl());

        // Update supplier
        if (request.getSupplierId() != null) {
            Supplier supplier = supplierRepository.findById(request.getSupplierId())
                    .orElseThrow(() -> new ResourceNotFoundException("Supplier", "id", request.getSupplierId()));
            medicine.setSupplier(supplier);
        } else {
            medicine.setSupplier(null);
        }

        // Update medicine units
        medicineUnitRepository.deleteByMedicine(medicine);
        List<MedicineUnit> units = new ArrayList<>();
        for (MedicineRequest.UnitRequest unitRequest : request.getUnits()) {
            MedicineUnit unit = MedicineUnit.builder()
                    .medicine(medicine)
                    .type(UnitType.fromString(unitRequest.getType()))
                    .quantity(unitRequest.getQuantity())
                    .price(unitRequest.getPrice())
                    .build();
            units.add(unit);
        }
        medicineUnitRepository.saveAll(units);
        medicine.setUnits(units);

        Medicine updatedMedicine = medicineRepository.save(medicine);
        log.info("Medicine updated with ID: {}", id);

        return mapToMedicineResponse(updatedMedicine);
    }

    @Transactional
    public void deleteMedicine(UUID id) {
        Medicine medicine = medicineRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", id));

        // Soft delete
        medicine.setActive(false);
        medicineRepository.save(medicine);

        // Update category count
        updateCategoryCount(medicine.getCategory(), false);

        log.info("Medicine deactivated with ID: {}", id);
    }

    @Transactional
    public StockMovementResponse deductStock(UUID medicineId, StockDeductionRequest request) {
        Medicine medicine = medicineRepository.findById(medicineId)
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", medicineId));

        User performedBy = userRepository.findById(request.getPerformedBy())
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", request.getPerformedBy()));

        // Calculate actual quantity based on unit type
        int actualQuantity = calculateActualQuantity(medicine, request.getUnitType(), request.getQuantity());

        // Check if sufficient stock is available
        if (medicine.getStockQuantity() < actualQuantity) {
            throw new InsufficientStockException(
                    medicine.getName(),
                    medicine.getStockQuantity(),
                    actualQuantity
            );
        }

        int previousStock = medicine.getStockQuantity();
        int newStock = previousStock - actualQuantity;

        // Update stock quantity
        medicine.setStockQuantity(newStock);
        medicineRepository.save(medicine);

        // Create stock movement record
        StockMovement stockMovement = StockMovement.builder()
                .medicine(medicine)
                .medicineName(medicine.getName())
                .type(StockMovementType.SALE)
                .quantity(-actualQuantity) // Negative for deduction
                .previousStock(previousStock)
                .newStock(newStock)
                .referenceId(request.getReferenceId())
                .performedBy(performedBy)
                .performedByName(performedBy.getName())
                .performedByRole(Role.valueOf(request.getPerformedByRole()))
                .createdAt(java.time.LocalDateTime.now())
                .build();

        StockMovement savedMovement = stockMovementRepository.save(stockMovement);
        log.info("Stock deducted for medicine {}: {} units", medicine.getName(), actualQuantity);

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

        // Update stock quantity
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
                .createdAt(java.time.LocalDateTime.now())
                .build();

        StockMovement savedMovement = stockMovementRepository.save(stockMovement);
        log.info("Stock added for medicine {}: {} units", medicine.getName(), request.getQuantity());

        return mapToStockMovementResponse(savedMovement);
    }

    private int calculateActualQuantity(Medicine medicine, String unitType, int quantity) {
        MedicineUnit unit = medicineUnitRepository.findByMedicineAndType(medicine, unitType)
                .orElseThrow(() -> new ApiException("Unit type not found for medicine", HttpStatus.BAD_REQUEST));

        return quantity * unit.getQuantity();
    }

    private void updateCategoryCount(String categoryName, boolean increment) {
        categoryRepository.findByName(categoryName).ifPresent(category -> {
            if (increment) {
                category.setMedicineCount(category.getMedicineCount() + 1);
            } else {
                category.setMedicineCount(Math.max(0, category.getMedicineCount() - 1));
            }
            categoryRepository.save(category);
        });
    }

    public List<String> getAllCategories() {
        return medicineRepository.findAllCategories();
    }

    public long countTotalMedicines() {
        return medicineRepository.countByIsActiveTrue();
    }

    public long getTotalStockQuantity() {
        Long total = medicineRepository.sumStockQuantity();
        return total != null ? total : 0;
    }

    public List<MedicineResponse> getLowStockMedicines() {
        Page<Medicine> lowStockPage = medicineRepository.findLowStockItems(PageRequest.of(0, 50));
        return lowStockPage.getContent()
                .stream()
                .map(this::mapToMedicineResponse)
                .collect(Collectors.toList());
    }

    public List<MedicineResponse> getExpiringMedicines() {
        LocalDate expiryThreshold = LocalDate.now().plusDays(90);
        Page<Medicine> expiringPage = medicineRepository.findExpiringItems(expiryThreshold, PageRequest.of(0, 50));
        return expiringPage.getContent()
                .stream()
                .map(this::mapToMedicineResponse)
                .collect(Collectors.toList());
    }

    private MedicineResponse mapToMedicineResponse(Medicine medicine) {
        MedicineResponse response = modelMapper.map(medicine, MedicineResponse.class);

        if (medicine.getSupplier() != null) {
            response.setSupplierId(medicine.getSupplier().getId());
            response.setSupplierName(medicine.getSupplier().getName());
        }

        // Map units
        List<MedicineResponse.UnitResponse> unitResponses = medicine.getUnits().stream()
                .map(unit -> MedicineResponse.UnitResponse.builder()
                        .type(unit.getType().getValue())
                        .quantity(unit.getQuantity())
                        .price(unit.getPrice())
                        .build())
                .collect(Collectors.toList());
        response.setUnits(unitResponses);

        return response;
    }

    private StockMovementResponse mapToStockMovementResponse(StockMovement stockMovement) {
        return modelMapper.map(stockMovement, StockMovementResponse.class);
    }
}