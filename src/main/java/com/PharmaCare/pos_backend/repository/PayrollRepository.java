package com.PharmaCare.pos_backend.repository;

import com.PharmaCare.pos_backend.enums.PayrollStatus;
import com.PharmaCare.pos_backend.model.Payroll;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PayrollRepository extends JpaRepository<Payroll, UUID> {
    Page<Payroll> findByEmployeeId(UUID employeeId, Pageable pageable);
    Page<Payroll> findByStatus(PayrollStatus status, Pageable pageable);

    Optional<Payroll> findByEmployeeIdAndMonth(UUID employeeId, String month);

    @Query("SELECT p FROM Payroll p WHERE " +
            "(:employeeId IS NULL OR p.employee.id = :employeeId) AND " +
            "(:month IS NULL OR p.month = :month) AND " +
            "(:status IS NULL OR p.status = :status)")
    Page<Payroll> findPayrollsByCriteria(@Param("employeeId") UUID employeeId,
                                         @Param("month") String month,
                                         @Param("status") PayrollStatus status,
                                         Pageable pageable);

    @Query("SELECT SUM(p.netSalary) FROM Payroll p WHERE p.status = 'PAID' AND p.month = :month")
    BigDecimal getTotalSalaryForMonth(@Param("month") String month);

    @Query("SELECT p.employee.department, SUM(p.netSalary) as total FROM Payroll p WHERE " +
            "p.status = 'PAID' AND p.month = :month GROUP BY p.employee.department")
    List<Object[]> getSalaryByDepartment(@Param("month") String month);
}