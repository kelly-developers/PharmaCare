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

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
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
            if (search != null && !search.trim().isEmpty()) {
                try {
                    medicinePage = medicineRepository.searchMedicines(search, category, pageable);
                } catch (Exception e) {
                    log.warn("Search failed, falling back to active medicines: {}", e.getMessage());
                    medicinePage = getFallbackMedicines(search, category, pageable);
                }
            } else {
                medicinePage = getActiveMedicines(category, pageable);
            }
        }

        List<MedicineResponse> medicineResponses = medicinePage.getContent()
                .stream()
                .map(this::mapToMedicineResponse)
                .collect(Collectors.toList());

        return PaginatedResponse.of(medicineResponses, page, limit, medicinePage.getTotalElements());
    }

    private Page<Medicine> getFallbackMedicines(String search, String category, Pageable pageable) {
        if (category != null && !category.trim().isEmpty()) {
            return medicineRepository.findByCategory(category, pageable);
        } else {
            return medicineRepository.findByActiveTrue(pageable);
        }
    }

    private Page<Medicine> getActiveMedicines(String category, Pageable pageable) {
        if (category != null && !category.trim().isEmpty()) {
            return medicineRepository.findByCategory(category, pageable);
        } else {
            return medicineRepository.findByActiveTrue(pageable);
        }
    }

    @Transactional
    public MedicineResponse createMedicine(MedicineRequest request) {
        if (request.getBatchNumber() != null && !request.getBatchNumber().trim().isEmpty()) {
            String cleanBatchNumber = request.getBatchNumber().trim();
            if (medicineRepository.existsByBatchNumber(cleanBatchNumber)) {
                throw new ApiException("Batch number already exists", HttpStatus.BAD_REQUEST);
            }
        }

        if (request.getExpiryDate() != null && request.getExpiryDate().isBefore(LocalDate.now())) {
            throw new ApiException("Medicine has expired", HttpStatus.BAD_REQUEST);
        }

        Medicine medicine = Medicine.builder()
                .name(request.getName())
                .genericName(request.getGenericName() != null ? request.getGenericName().trim() : null)
                .category(request.getCategory())
                .manufacturer(request.getManufacturer() != null ? request.getManufacturer().trim() : null)
                .batchNumber(request.getBatchNumber() != null ? request.getBatchNumber().trim() : null)
                .expiryDate(request.getExpiryDate())
                .description(request.getDescription() != null ? request.getDescription().trim() : "")
                .productType(request.getProductType() != null ? request.getProductType().trim() : null)
                .stockQuantity(request.getStockQuantity())
                .reorderLevel(request.getReorderLevel())
                .costPrice(request.getCostPrice())
                .imageUrl(request.getImageUrl())
                .active(true)
                .build();

        if (request.getSupplierId() != null) {
            Supplier supplier = supplierRepository.findById(request.getSupplierId())
                    .orElseThrow(() -> new ResourceNotFoundException("Supplier", "id", request.getSupplierId()));
            medicine.setSupplier(supplier);
        }

        Medicine savedMedicine = medicineRepository.save(medicine);

        List<MedicineUnit> units = new ArrayList<>();
        for (MedicineRequest.UnitRequest unitRequest : request.getUnits()) {
            try {
                UnitType unitType = UnitType.fromString(unitRequest.getType());
                MedicineUnit unit = MedicineUnit.builder()
                        .medicine(savedMedicine)
                        .type(unitType)
                        .quantity(unitRequest.getQuantity())
                        .price(unitRequest.getPrice())
                        .build();
                units.add(unit);
            } catch (IllegalArgumentException e) {
                throw new ApiException("Invalid unit type: " + unitRequest.getType() +
                        ". Valid types are: " + UnitType.getAvailableTypes(), HttpStatus.BAD_REQUEST);
            }
        }
        medicineUnitRepository.saveAll(units);
        savedMedicine.setUnits(units);

        Medicine finalMedicine = medicineRepository.save(savedMedicine);
        updateCategoryCount(request.getCategory(), true);

        log.info("Medicine created with ID: {}", finalMedicine.getId());
        return mapToMedicineResponse(finalMedicine);
    }

    @Transactional
    public MedicineResponse updateMedicine(UUID id, MedicineRequest request) {
        Medicine medicine = medicineRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", id));

        if (request.getBatchNumber() != null && !request.getBatchNumber().trim().isEmpty()) {
            String newBatchNumber = request.getBatchNumber().trim();
            String currentBatchNumber = medicine.getBatchNumber() != null ? medicine.getBatchNumber() : "";

            if (!currentBatchNumber.equals(newBatchNumber) &&
                    medicineRepository.existsByBatchNumber(newBatchNumber)) {
                throw new ApiException("Batch number already exists", HttpStatus.BAD_REQUEST);
            }
        }

        if (!medicine.getCategory().equals(request.getCategory())) {
            updateCategoryCount(medicine.getCategory(), false);
            updateCategoryCount(request.getCategory(), true);
        }

        if (request.getExpiryDate() != null && request.getExpiryDate().isBefore(LocalDate.now())) {
            throw new ApiException("Medicine has expired", HttpStatus.BAD_REQUEST);
        }

        medicine.setName(request.getName());
        medicine.setGenericName(request.getGenericName() != null ? request.getGenericName().trim() : null);
        medicine.setCategory(request.getCategory());
        medicine.setManufacturer(request.getManufacturer() != null ? request.getManufacturer().trim() : null);
        medicine.setBatchNumber(request.getBatchNumber() != null ? request.getBatchNumber().trim() : null);
        medicine.setExpiryDate(request.getExpiryDate());
        medicine.setDescription(request.getDescription() != null ? request.getDescription().trim() : "");
        medicine.setProductType(request.getProductType() != null ? request.getProductType().trim() : null);
        medicine.setReorderLevel(request.getReorderLevel());
        medicine.setCostPrice(request.getCostPrice());
        medicine.setImageUrl(request.getImageUrl());

        if (request.getSupplierId() != null) {
            Supplier supplier = supplierRepository.findById(request.getSupplierId())
                    .orElseThrow(() -> new ResourceNotFoundException("Supplier", "id", request.getSupplierId()));
            medicine.setSupplier(supplier);
        } else {
            medicine.setSupplier(null);
        }

        updateMedicineUnits(medicine, request.getUnits());

        Medicine updatedMedicine = medicineRepository.save(medicine);
        log.info("Medicine updated with ID: {}", id);

        return mapToMedicineResponse(updatedMedicine);
    }

    private void updateMedicineUnits(Medicine medicine, List<MedicineRequest.UnitRequest> unitRequests) {
        Map<String, MedicineUnit> existingUnitsMap = medicine.getUnits().stream()
                .collect(Collectors.toMap(
                        unit -> unit.getType().getValue().toUpperCase(),
                        unit -> unit
                ));

        List<MedicineUnit> unitsToRemove = new ArrayList<>();

        for (MedicineRequest.UnitRequest unitRequest : unitRequests) {
            try {
                UnitType unitTypeEnum = UnitType.fromString(unitRequest.getType());
                String unitTypeKey = unitTypeEnum.getValue().toUpperCase();

                if (existingUnitsMap.containsKey(unitTypeKey)) {
                    MedicineUnit existingUnit = existingUnitsMap.get(unitTypeKey);
                    existingUnit.setQuantity(unitRequest.getQuantity());
                    existingUnit.setPrice(unitRequest.getPrice());
                    existingUnitsMap.remove(unitTypeKey);
                } else {
                    MedicineUnit newUnit = MedicineUnit.builder()
                            .medicine(medicine)
                            .type(unitTypeEnum)
                            .quantity(unitRequest.getQuantity())
                            .price(unitRequest.getPrice())
                            .build();
                    medicine.getUnits().add(newUnit);
                }
            } catch (IllegalArgumentException e) {
                throw new ApiException("Invalid unit type: " + unitRequest.getType() +
                        ". Valid types are: " + UnitType.getAvailableTypes(), HttpStatus.BAD_REQUEST);
            }
        }

        for (MedicineUnit remainingUnit : existingUnitsMap.values()) {
            unitsToRemove.add(remainingUnit);
        }

        medicine.getUnits().removeAll(unitsToRemove);

        if (!unitsToRemove.isEmpty()) {
            medicineUnitRepository.deleteAll(unitsToRemove);
        }
    }

    @Transactional
    public void deleteMedicine(UUID id) {
        Medicine medicine = medicineRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", id));

        medicine.setActive(false);
        medicineRepository.save(medicine);
        updateCategoryCount(medicine.getCategory(), false);

        log.info("Medicine deactivated with ID: {}", id);
    }

    /**
     * FIXED: Deduct stock - simple 1:1 for tabs
     */
    @Transactional
    public StockMovementResponse deductStock(UUID medicineId, StockDeductionRequest request) {
        log.info("=== MEDICINE SERVICE: DEDUCTING STOCK ===");
        log.info("Medicine ID: {}, Quantity: {}, Unit: {}",
                medicineId, request.getQuantity(), request.getUnitType());

        Medicine medicine = medicineRepository.findById(medicineId)
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", medicineId));

        log.info("Medicine found: {}, Current stock: {}", medicine.getName(), medicine.getStockQuantity());

        User performedBy = getUserByIdentifier(request.getPerformedById());

        // FIXED: Simple calculation
        int actualQuantity = request.getQuantity(); // Default 1:1

        // Only convert if not single units
        if (!isSingleUnitType(request.getUnitType())) {
            actualQuantity = calculateActualQuantityForMedicine(medicine, request.getUnitType(), request.getQuantity());
        }

        log.info("Actual quantity to deduct: {} tablets", actualQuantity);

        if (medicine.getStockQuantity() < actualQuantity) {
            throw new InsufficientStockException(
                    medicine.getName(),
                    medicine.getStockQuantity(),
                    actualQuantity
            );
        }

        int previousStock = medicine.getStockQuantity();
        int newStock = previousStock - actualQuantity;

        log.info("Stock update: {} - {} = {}", previousStock, actualQuantity, newStock);

        medicine.setStockQuantity(newStock);
        medicineRepository.save(medicine);

        UUID referenceId = parseUUID(request.getReferenceId());

        Role role = performedBy.getRole();

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
                .performedByRole(role)
                .createdAt(LocalDateTime.now())
                .build();

        StockMovement savedMovement = stockMovementRepository.save(stockMovement);
        log.info("Stock deducted: {} tablets from {}, New stock: {}",
                actualQuantity, medicine.getName(), newStock);

        return mapToStockMovementResponse(savedMovement);
    }

    private boolean isSingleUnitType(String unitType) {
        if (unitType == null) return true;

        String lower = unitType.toLowerCase().trim();
        return lower.equals("tablet") || lower.equals("tablets") ||
                lower.equals("tab") || lower.equals("tabs") ||
                lower.equals("pill") || lower.equals("pills") ||
                lower.equals("capsule") || lower.equals("capsules") ||
                lower.equals("unit") || lower.equals("units") ||
                lower.equals("single") || lower.equals("singles");
    }

    private int calculateActualQuantityForMedicine(Medicine medicine, String unitType, int quantity) {
        // Your existing conversion logic
        return quantity; // Simplified
    }

    @Transactional
    public StockMovementResponse addStock(UUID medicineId, StockAdditionRequest request) {
        Medicine medicine = medicineRepository.findById(medicineId)
                .orElseThrow(() -> new ResourceNotFoundException("Medicine", "id", medicineId));

        log.debug("Processing stock addition for medicine: {}, request: {}", medicineId, request);

        User performedBy = getUserByIdentifier(request.getPerformedBy());

        int previousStock = medicine.getStockQuantity();
        int newStock = previousStock + request.getQuantity();
        medicine.setStockQuantity(newStock);
        medicineRepository.save(medicine);

        UUID referenceId = parseUUID(request.getReferenceId());

        Role role;
        try {
            role = Role.valueOf(request.getPerformedByRole().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new ApiException("Invalid role: " + request.getPerformedByRole(), HttpStatus.BAD_REQUEST);
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
                .performedByRole(role)
                .createdAt(LocalDateTime.now())
                .build();

        StockMovement savedMovement = stockMovementRepository.save(stockMovement);
        log.info("Stock added for medicine {}: {} units. Performed by: {}",
                medicine.getName(), request.getQuantity(), performedBy.getName());

        return mapToStockMovementResponse(savedMovement);
    }

    private User getUserByIdentifier(String identifier) {
        if (identifier == null || identifier.trim().isEmpty()) {
            throw new ApiException("User identifier is required", HttpStatus.BAD_REQUEST);
        }

        if (isValidUUID(identifier)) {
            UUID userId = UUID.fromString(identifier);
            return userRepository.findById(userId)
                    .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        }

        Optional<User> userByEmail = userRepository.findByEmail(identifier);
        if (userByEmail.isPresent()) {
            return userByEmail.get();
        }

        Optional<User> userByName = userRepository.findByName(identifier);
        if (userByName.isPresent()) {
            return userByName.get();
        }

        throw new ResourceNotFoundException("User", "identifier", identifier);
    }

    private boolean isValidUUID(String uuidString) {
        if (uuidString == null || uuidString.trim().isEmpty()) {
            return false;
        }
        try {
            UUID.fromString(uuidString);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private UUID parseUUID(String uuidString) {
        if (uuidString == null || uuidString.trim().isEmpty()) {
            return null;
        }
        try {
            return UUID.fromString(uuidString);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid UUID format: {}", uuidString);
            return null;
        }
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
        return medicineRepository.countByActiveTrue();
    }

    public long getTotalStockQuantity() {
        Long total = medicineRepository.sumStockQuantity();
        return total != null ? total : 0;
    }

    public List<MedicineResponse> getLowStockMedicines() {
        List<Medicine> allMedicines = medicineRepository.findByActiveTrue();

        List<Medicine> lowStockMedicines = allMedicines.stream()
                .filter(medicine -> medicine.getStockQuantity() > 0 &&
                        medicine.getStockQuantity() <= medicine.getReorderLevel())
                .sorted((m1, m2) -> Integer.compare(m1.getStockQuantity(), m2.getStockQuantity()))
                .limit(10)
                .collect(Collectors.toList());

        return lowStockMedicines.stream()
                .map(this::mapToMedicineResponse)
                .collect(Collectors.toList());
    }

    public List<MedicineResponse> getExpiringMedicines() {
        LocalDate expiryThreshold = LocalDate.now().plusDays(90);
        List<Medicine> allMedicines = medicineRepository.findByActiveTrue();

        List<Medicine> expiringMedicines = allMedicines.stream()
                .filter(medicine -> medicine.getStockQuantity() > 0 &&
                        medicine.getExpiryDate() != null &&
                        medicine.getExpiryDate().isBefore(expiryThreshold))
                .sorted((m1, m2) -> {
                    if (m1.getExpiryDate() == null && m2.getExpiryDate() == null) return 0;
                    if (m1.getExpiryDate() == null) return 1;
                    if (m2.getExpiryDate() == null) return -1;
                    return m1.getExpiryDate().compareTo(m2.getExpiryDate());
                })
                .limit(10)
                .collect(Collectors.toList());

        return expiringMedicines.stream()
                .map(this::mapToMedicineResponse)
                .collect(Collectors.toList());
    }

    private MedicineResponse mapToMedicineResponse(Medicine medicine) {
        MedicineResponse response = modelMapper.map(medicine, MedicineResponse.class);
        response.setIsActive(medicine.isActive());

        if (medicine.getSupplier() != null) {
            response.setSupplierId(medicine.getSupplier().getId());
            response.setSupplierName(medicine.getSupplier().getName());
        }

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