package com.PharmaCare.pos_backend.repository;

import com.PharmaCare.pos_backend.model.entity.Medicine;
import com.PharmaCare.pos_backend.model.entity.MedicineUnit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MedicineUnitRepository extends JpaRepository<MedicineUnit, UUID> {
    List<MedicineUnit> findByMedicine(Medicine medicine);
    Optional<MedicineUnit> findByMedicineAndType(Medicine medicine, String type);
    void deleteByMedicine(Medicine medicine);
}