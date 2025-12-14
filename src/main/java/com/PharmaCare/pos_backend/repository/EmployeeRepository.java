package com.PharmaCare.pos_backend.repository;

import com.PharmaCare.pos_backend.model.Employee;
import com.PharmaCare.pos_backend.model.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EmployeeRepository extends JpaRepository<Employee, UUID> {
    Optional<Employee> findByUser(User user);
    Optional<Employee> findByEmployeeId(String employeeId);
    boolean existsByEmployeeId(String employeeId);

    List<Employee> findByIsActiveTrue();

    @Query("SELECT e FROM Employee e WHERE " +
            "(:search IS NULL OR LOWER(e.user.name) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
            "LOWER(e.employeeId) LIKE LOWER(CONCAT('%', :search, '%'))) AND " +
            "(:department IS NULL OR e.department = :department) AND " +
            "(:activeOnly IS NULL OR e.isActive = :activeOnly)")
    Page<Employee> searchEmployees(@Param("search") String search,
                                   @Param("department") String department,
                                   @Param("activeOnly") Boolean activeOnly,
                                   Pageable pageable);

    @Query("SELECT e.department, COUNT(e) as count FROM Employee e WHERE e.isActive = true GROUP BY e.department")
    List<Object[]> countByDepartment();

    long countByIsActiveTrue();
}