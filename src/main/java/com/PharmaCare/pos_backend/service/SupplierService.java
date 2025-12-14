package com.PharmaCare.pos_backend.service;

import com.PharmaCare.pos_backend.dto.request.SupplierRequest;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.SupplierResponse;
import com.PharmaCare.pos_backend.model.Supplier;
import com.PharmaCare.pos_backend.exception.ApiException;
import com.PharmaCare.pos_backend.exception.ResourceNotFoundException;
import com.PharmaCare.pos_backend.repository.SupplierRepository;
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

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class SupplierService {

    private final SupplierRepository supplierRepository;
    private final ModelMapper modelMapper;

    public SupplierResponse getSupplierById(UUID id) {
        Supplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Supplier", "id", id));
        return mapToSupplierResponse(supplier);
    }

    public PaginatedResponse<SupplierResponse> getAllSuppliers(int page, int limit, String search, Boolean activeOnly) {
        Pageable pageable = PageRequest.of(page - 1, limit, Sort.by("name").ascending());

        Page<Supplier> suppliersPage = supplierRepository.searchSuppliers(search, activeOnly, pageable);

        List<SupplierResponse> supplierResponses = suppliersPage.getContent()
                .stream()
                .map(this::mapToSupplierResponse)
                .collect(Collectors.toList());

        return PaginatedResponse.of(supplierResponses, page, limit, suppliersPage.getTotalElements());
    }

    @Transactional
    public SupplierResponse createSupplier(SupplierRequest request) {
        // Check if supplier already exists
        if (supplierRepository.existsByName(request.getName())) {
            throw new ApiException("Supplier already exists", HttpStatus.BAD_REQUEST);
        }

        Supplier supplier = Supplier.builder()
                .name(request.getName())
                .contactPerson(request.getContactPerson())
                .email(request.getEmail())
                .phone(request.getPhone())
                .address(request.getAddress())
                .isActive(true)
                .build();

        Supplier savedSupplier = supplierRepository.save(supplier);
        log.info("Supplier created: {}", request.getName());

        return mapToSupplierResponse(savedSupplier);
    }

    @Transactional
    public SupplierResponse updateSupplier(UUID id, SupplierRequest request) {
        Supplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Supplier", "id", id));

        // Check if name is being changed and if new name already exists
        if (!supplier.getName().equals(request.getName()) &&
                supplierRepository.existsByName(request.getName())) {
            throw new ApiException("Supplier name already exists", HttpStatus.BAD_REQUEST);
        }

        supplier.setName(request.getName());
        supplier.setContactPerson(request.getContactPerson());
        supplier.setEmail(request.getEmail());
        supplier.setPhone(request.getPhone());
        supplier.setAddress(request.getAddress());

        Supplier updatedSupplier = supplierRepository.save(supplier);
        log.info("Supplier updated: {}", request.getName());

        return mapToSupplierResponse(updatedSupplier);
    }

    @Transactional
    public void deleteSupplier(UUID id) {
        Supplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Supplier", "id", id));

        // Soft delete - mark as inactive
        supplier.setActive(false);
        supplierRepository.save(supplier);

        log.info("Supplier deactivated: {}", supplier.getName());
    }

    @Transactional
    public void activateSupplier(UUID id) {
        Supplier supplier = supplierRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Supplier", "id", id));

        supplier.setActive(true);
        supplierRepository.save(supplier);

        log.info("Supplier activated: {}", supplier.getName());
    }

    public List<SupplierResponse> getActiveSuppliers() {
        List<Supplier> activeSuppliers = supplierRepository.findByIsActiveTrue();
        return activeSuppliers.stream()
                .map(this::mapToSupplierResponse)
                .collect(Collectors.toList());
    }

    public SupplierResponse getSupplierByName(String name) {
        Supplier supplier = supplierRepository.findByName(name)
                .orElseThrow(() -> new ResourceNotFoundException("Supplier", "name", name));
        return mapToSupplierResponse(supplier);
    }

    public long countActiveSuppliers() {
        return supplierRepository.countByIsActiveTrue();
    }

    private SupplierResponse mapToSupplierResponse(Supplier supplier) {
        return modelMapper.map(supplier, SupplierResponse.class);
    }
}