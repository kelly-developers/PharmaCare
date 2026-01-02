package com.PharmaCare.pos_backend.repository;

import com.PharmaCare.pos_backend.enums.UnitType;
import com.PharmaCare.pos_backend.model.Medicine;
import com.PharmaCare.pos_backend.model.MedicineUnit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MedicineUnitRepository extends JpaRepository<MedicineUnit, UUID> {
    List<MedicineUnit> findByMedicine(Medicine medicine);

    // Option 1: Accept UnitType parameter directly
    @Query("SELECT mu FROM MedicineUnit mu WHERE mu.medicine = :medicine AND mu.type = :unitType")
    Optional<MedicineUnit> findByMedicineAndType(
            @Param("medicine") Medicine medicine,
            @Param("unitType") UnitType unitType);

    // NEW: List version to handle multiple results
    @Query("SELECT mu FROM MedicineUnit mu WHERE mu.medicine = :medicine AND mu.type = :unitType")
    List<MedicineUnit> findByMedicineAndTypeList(
            @Param("medicine") Medicine medicine,
            @Param("unitType") UnitType unitType);

    // Option 2: Find by string type - FIXED VERSION
    // Use CAST to convert enum to string for comparison
    @Query("SELECT mu FROM MedicineUnit mu WHERE mu.medicine = :medicine AND CAST(mu.type AS string) = :typeStr")
    Optional<MedicineUnit> findByMedicineAndTypeString(
            @Param("medicine") Medicine medicine,
            @Param("typeStr") String typeStr);

    // NEW: List version for string-based lookup
    @Query("SELECT mu FROM MedicineUnit mu WHERE mu.medicine = :medicine AND CAST(mu.type AS string) = :typeStr")
    List<MedicineUnit> findByMedicineAndTypeStringList(
            @Param("medicine") Medicine medicine,
            @Param("typeStr") String typeStr);

    // Option 3: Case-insensitive version
    @Query("SELECT mu FROM MedicineUnit mu WHERE mu.medicine = :medicine AND LOWER(CAST(mu.type AS string)) = LOWER(:typeStr)")
    Optional<MedicineUnit> findByMedicineAndTypeStringCaseInsensitive(
            @Param("medicine") Medicine medicine,
            @Param("typeStr") String typeStr);

    // NEW: List version for case-insensitive lookup
    @Query("SELECT mu FROM MedicineUnit mu WHERE mu.medicine = :medicine AND LOWER(CAST(mu.type AS string)) = LOWER(:typeStr)")
    List<MedicineUnit> findByMedicineAndTypeStringCaseInsensitiveList(
            @Param("medicine") Medicine medicine,
            @Param("typeStr") String typeStr);

    void deleteByMedicine(Medicine medicine);

    

    // NEW: Native query for more reliable string   comparison
    @Query(value = "SELECT * FROM spotmedpharmacare.medicine_units mu WHERE mu.medicine_id = :medicineId AND mu.type::text = :typeStr",
            nativeQuery = true)
    List<MedicineUnit> findByMedicineIdAndTypeStringNative(
            @Param("medicineId") UUID medicineId,
            @Param("typeStr") String typeStr);

    // NEW: Case-insensitive native query
    @Query(value = "SELECT * FROM spotmedpharmacare.medicine_units mu WHERE mu.medicine_id = :medicineId AND LOWER(mu.type::text) = LOWER(:typeStr)",
            nativeQuery = true)
    List<MedicineUnit> findByMedicineIdAndTypeStringCaseInsensitiveNative(
            @Param("medicineId") UUID medicineId,
            @Param("typeStr") String typeStr);
}