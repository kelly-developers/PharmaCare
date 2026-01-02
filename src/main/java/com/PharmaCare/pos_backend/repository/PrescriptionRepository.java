package com.PharmaCare.pos_backend.repository;

import com.PharmaCare.pos_backend.enums.PrescriptionStatus;
import com.PharmaCare.pos_backend.model.Prescription;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface PrescriptionRepository extends JpaRepository<Prescription, UUID> {
    Page<Prescription> findByStatus(PrescriptionStatus status, Pageable pageable);

    // FIXED: Simplified LIKE query
    @Query("""
        SELECT p FROM Prescription p 
        WHERE (:status IS NULL OR p.status = :status) 
        AND (:patientPhone IS NULL OR p.patientPhone LIKE %:patientPhone%) 
        AND (:createdById IS NULL OR p.createdBy.id = :createdById)
        ORDER BY p.createdAt DESC
    """)
    Page<Prescription> findPrescriptionsByCriteria(
            @Param("status") PrescriptionStatus status,
            @Param("patientPhone") String patientPhone,
            @Param("createdById") UUID createdById,
            Pageable pageable
    );

    List<Prescription> findByPatientPhone(String patientPhone);
    List<Prescription> findByCreatedById(UUID createdById);

    long countByStatus(PrescriptionStatus status);

    @Query("SELECT p FROM Prescription p WHERE p.status = 'PENDING' ORDER BY p.createdAt ASC")
    List<Prescription> findPendingPrescriptions();
}