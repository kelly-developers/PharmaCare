package com.PharmaCare.pos_backend.service;

import com.PharmaCare.pos_backend.dto.request.PrescriptionRequest;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.PrescriptionResponse;
import com.PharmaCare.pos_backend.enums.PrescriptionStatus;
import com.PharmaCare.pos_backend.model.Prescription;
import com.PharmaCare.pos_backend.model.PrescriptionItem;
import com.PharmaCare.pos_backend.model.User;
import com.PharmaCare.pos_backend.exception.ApiException;
import com.PharmaCare.pos_backend.exception.ResourceNotFoundException;
import com.PharmaCare.pos_backend.repository.PrescriptionRepository;
import com.PharmaCare.pos_backend.repository.PrescriptionItemRepository;
import com.PharmaCare.pos_backend.repository.UserRepository;
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

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class PrescriptionService {

    private final PrescriptionRepository prescriptionRepository;
    private final PrescriptionItemRepository prescriptionItemRepository;
    private final UserRepository userRepository;
    private final ModelMapper modelMapper;

    public PrescriptionResponse getPrescriptionById(UUID id) {
        Prescription prescription = prescriptionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Prescription", "id", id));
        return mapToPrescriptionResponse(prescription);
    }

    public PaginatedResponse<PrescriptionResponse> getAllPrescriptions(int page, int limit, PrescriptionStatus status,
                                                                       String patientPhone, UUID createdById) {
        Pageable pageable = PageRequest.of(page - 1, limit, Sort.by("createdAt").descending());

        Page<Prescription> prescriptionsPage = prescriptionRepository.findPrescriptionsByCriteria(
                status, patientPhone, createdById, pageable);

        List<PrescriptionResponse> prescriptionResponses = prescriptionsPage.getContent()
                .stream()
                .map(this::mapToPrescriptionResponse)
                .collect(Collectors.toList());

        return PaginatedResponse.of(prescriptionResponses, page, limit, prescriptionsPage.getTotalElements());
    }

    @Transactional
    public PrescriptionResponse createPrescription(PrescriptionRequest request, String currentUsername) {
        // Get current user from username (email)
        User createdBy = userRepository.findByEmail(currentUsername)
                .orElseThrow(() -> new ResourceNotFoundException("User", "email", currentUsername));

        Prescription prescription = Prescription.builder()
                .patientName(request.getPatientName())
                .patientPhone(request.getPatientPhone())
                .diagnosis(request.getDiagnosis())
                .notes(request.getNotes())
                .status(PrescriptionStatus.PENDING)
                .createdBy(createdBy)
                .createdAt(java.time.LocalDateTime.now())
                .build();

        Prescription savedPrescription = prescriptionRepository.save(prescription);

        // Create prescription items
        List<PrescriptionItem> prescriptionItems = new ArrayList<>();
        for (PrescriptionRequest.PrescriptionItemRequest itemRequest : request.getItems()) {
            PrescriptionItem item = PrescriptionItem.builder()
                    .prescription(savedPrescription)
                    .medicine(itemRequest.getMedicine())
                    .dosage(itemRequest.getDosage())
                    .frequency(itemRequest.getFrequency())
                    .duration(itemRequest.getDuration())
                    .instructions(itemRequest.getInstructions())
                    .build();
            prescriptionItems.add(item);
        }

        prescriptionItemRepository.saveAll(prescriptionItems);
        savedPrescription.setItems(prescriptionItems);

        log.info("Prescription created with ID: {} by user: {}", savedPrescription.getId(), currentUsername);
        return mapToPrescriptionResponse(savedPrescription);
    }

    @Transactional
    public PrescriptionResponse updatePrescription(UUID id, PrescriptionRequest request) {
        Prescription prescription = prescriptionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Prescription", "id", id));

        // Only allow updates if prescription is pending
        if (prescription.getStatus() != PrescriptionStatus.PENDING) {
            throw new ApiException("Only pending prescriptions can be updated", HttpStatus.BAD_REQUEST);
        }

        prescription.setPatientName(request.getPatientName());
        prescription.setPatientPhone(request.getPatientPhone());
        prescription.setDiagnosis(request.getDiagnosis());
        prescription.setNotes(request.getNotes());

        // Update prescription items
        prescriptionItemRepository.deleteByPrescriptionId(id);
        List<PrescriptionItem> prescriptionItems = new ArrayList<>();
        for (PrescriptionRequest.PrescriptionItemRequest itemRequest : request.getItems()) {
            PrescriptionItem item = PrescriptionItem.builder()
                    .prescription(prescription)
                    .medicine(itemRequest.getMedicine())
                    .dosage(itemRequest.getDosage())
                    .frequency(itemRequest.getFrequency())
                    .duration(itemRequest.getDuration())
                    .instructions(itemRequest.getInstructions())
                    .build();
            prescriptionItems.add(item);
        }

        prescriptionItemRepository.saveAll(prescriptionItems);
        prescription.setItems(prescriptionItems);

        Prescription updatedPrescription = prescriptionRepository.save(prescription);
        log.info("Prescription updated with ID: {}", id);

        return mapToPrescriptionResponse(updatedPrescription);
    }

    @Transactional
    public PrescriptionResponse updatePrescriptionStatus(UUID id, PrescriptionStatus status, UUID dispensedBy) {
        Prescription prescription = prescriptionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Prescription", "id", id));

        prescription.setStatus(status);

        if (status == PrescriptionStatus.DISPENSED && dispensedBy != null) {
            User dispensedByUser = userRepository.findById(dispensedBy)
                    .orElseThrow(() -> new ResourceNotFoundException("User", "id", dispensedBy));
            prescription.setDispensedBy(dispensedByUser);
            prescription.setDispensedAt(java.time.LocalDateTime.now());
        } else if (status == PrescriptionStatus.CANCELLED) {
            prescription.setDispensedBy(null);
            prescription.setDispensedAt(null);
        }

        Prescription updatedPrescription = prescriptionRepository.save(prescription);
        log.info("Prescription status updated to {} for ID: {}", status, id);

        return mapToPrescriptionResponse(updatedPrescription);
    }

    @Transactional
    public void deletePrescription(UUID id) {
        Prescription prescription = prescriptionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Prescription", "id", id));

        // Only allow deletion if prescription is pending
        if (prescription.getStatus() != PrescriptionStatus.PENDING) {
            throw new ApiException("Only pending prescriptions can be deleted", HttpStatus.BAD_REQUEST);
        }

        prescriptionRepository.delete(prescription);
        log.info("Prescription deleted with ID: {}", id);
    }

    public List<PrescriptionResponse> getPendingPrescriptions() {
        List<Prescription> pendingPrescriptions = prescriptionRepository.findPendingPrescriptions();
        return pendingPrescriptions.stream()
                .map(this::mapToPrescriptionResponse)
                .collect(Collectors.toList());
    }

    public List<PrescriptionResponse> getDispensedPrescriptions() {
        Page<Prescription> dispensedPrescriptions = prescriptionRepository.findByStatus(
                PrescriptionStatus.DISPENSED, PageRequest.of(0, 100, Sort.by("dispensedAt").descending()));

        return dispensedPrescriptions.getContent()
                .stream()
                .map(this::mapToPrescriptionResponse)
                .collect(Collectors.toList());
    }

    public List<PrescriptionResponse> getPrescriptionsByPatientPhone(String phone) {
        List<Prescription> prescriptions = prescriptionRepository.findByPatientPhone(phone);
        return prescriptions.stream()
                .map(this::mapToPrescriptionResponse)
                .collect(Collectors.toList());
    }

    public List<PrescriptionResponse> getPrescriptionsByCreator(UUID creatorId) {
        List<Prescription> prescriptions = prescriptionRepository.findByCreatedById(creatorId);
        return prescriptions.stream()
                .map(this::mapToPrescriptionResponse)
                .collect(Collectors.toList());
    }

    public long countPrescriptionsByStatus(PrescriptionStatus status) {
        return prescriptionRepository.countByStatus(status);
    }

    private PrescriptionResponse mapToPrescriptionResponse(Prescription prescription) {
        // Manual mapping to avoid ModelMapper issues
        PrescriptionResponse response = PrescriptionResponse.builder()
                .id(prescription.getId())
                .patientName(prescription.getPatientName())
                .patientPhone(prescription.getPatientPhone())
                .diagnosis(prescription.getDiagnosis())
                .notes(prescription.getNotes())
                .status(prescription.getStatus())
                .dispensedAt(prescription.getDispensedAt())
                .createdAt(prescription.getCreatedAt())
                .build();

        // Map createdBy user
        if (prescription.getCreatedBy() != null) {
            response.setCreatedBy(prescription.getCreatedBy().getId());
            response.setCreatedByName(prescription.getCreatedBy().getName());
        }

        // Map dispensedBy user
        if (prescription.getDispensedBy() != null) {
            response.setDispensedBy(prescription.getDispensedBy().getId());
            response.setDispensedByName(prescription.getDispensedBy().getName());
        }

        // Map prescription items
        if (prescription.getItems() != null && !prescription.getItems().isEmpty()) {
            List<PrescriptionResponse.PrescriptionItemResponse> itemResponses = prescription.getItems().stream()
                    .map(item -> PrescriptionResponse.PrescriptionItemResponse.builder()
                            .medicine(item.getMedicine())
                            .dosage(item.getDosage())
                            .frequency(item.getFrequency())
                            .duration(item.getDuration())
                            .instructions(item.getInstructions())
                            .build())
                    .collect(Collectors.toList());
            response.setItems(itemResponses);
        } else {
            response.setItems(new ArrayList<>());
        }

        return response;
    }
}