package com.PharmaCare.pos_backend.service;

import com.PharmaCare.pos_backend.dto.request.EmployeeRequest;
import com.PharmaCare.pos_backend.dto.request.PayrollRequest;
import com.PharmaCare.pos_backend.enums.PayrollStatus;
import com.PharmaCare.pos_backend.model.Employee;
import com.PharmaCare.pos_backend.model.Payroll;
import com.PharmaCare.pos_backend.model.User;

import com.PharmaCare.pos_backend.model.dto.response.EmployeeResponse;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.PayrollResponse;
import com.PharmaCare.pos_backend.exception.ApiException;
import com.PharmaCare.pos_backend.exception.ResourceNotFoundException;
import com.PharmaCare.pos_backend.repository.EmployeeRepository;
import com.PharmaCare.pos_backend.repository.PayrollRepository;
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

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmployeeService {

    private final EmployeeRepository employeeRepository;
    private final PayrollRepository payrollRepository;
    private final UserRepository userRepository;
    private final ModelMapper modelMapper;

    public EmployeeResponse getEmployeeById(UUID id) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Employee", "id", id));
        return mapToEmployeeResponse(employee);
    }

    public PaginatedResponse<EmployeeResponse> getAllEmployees(int page, int limit, String search,
                                                               String department, Boolean activeOnly) {
        Pageable pageable = PageRequest.of(page - 1, limit, Sort.by("createdAt").descending());

        Page<Employee> employeesPage = employeeRepository.searchEmployees(search, department, activeOnly, pageable);

        List<EmployeeResponse> employeeResponses = employeesPage.getContent()
                .stream()
                .map(this::mapToEmployeeResponse)
                .collect(Collectors.toList());

        return PaginatedResponse.of(employeeResponses, page, limit, employeesPage.getTotalElements());
    }

    @Transactional
    public EmployeeResponse createEmployee(EmployeeRequest request) {
        User user = userRepository.findById(request.getUserId())
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", request.getUserId()));

        // Check if employee already exists for this user
        if (employeeRepository.findByUser(user).isPresent()) {
            throw new ApiException("Employee already exists for this user", HttpStatus.BAD_REQUEST);
        }

        // Check if employee ID already exists
        if (employeeRepository.existsByEmployeeId(request.getEmployeeId())) {
            throw new ApiException("Employee ID already exists", HttpStatus.BAD_REQUEST);
        }

        Employee employee = Employee.builder()
                .user(user)
                .employeeId(request.getEmployeeId())
                .department(request.getDepartment())
                .hireDate(request.getHireDate())
                .salary(request.getSalary())
                .bankName(request.getBankName())
                .bankAccount(request.getBankAccount())
                .nhifNumber(request.getNhifNumber())
                .nssfNumber(request.getNssfNumber())
                .kraPin(request.getKraPin())
                .isActive(true)
                .build();

        Employee savedEmployee = employeeRepository.save(employee);
        log.info("Employee created with ID: {}", savedEmployee.getId());

        return mapToEmployeeResponse(savedEmployee);
    }

    @Transactional
    public EmployeeResponse updateEmployee(UUID id, EmployeeRequest request) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Employee", "id", id));

        // Check if employee ID is being changed and if new ID already exists
        if (!employee.getEmployeeId().equals(request.getEmployeeId()) &&
                employeeRepository.existsByEmployeeId(request.getEmployeeId())) {
            throw new ApiException("Employee ID already exists", HttpStatus.BAD_REQUEST);
        }

        employee.setEmployeeId(request.getEmployeeId());
        employee.setDepartment(request.getDepartment());
        employee.setHireDate(request.getHireDate());
        employee.setSalary(request.getSalary());
        employee.setBankName(request.getBankName());
        employee.setBankAccount(request.getBankAccount());
        employee.setNhifNumber(request.getNhifNumber());
        employee.setNssfNumber(request.getNssfNumber());
        employee.setKraPin(request.getKraPin());

        Employee updatedEmployee = employeeRepository.save(employee);
        log.info("Employee updated with ID: {}", id);

        return mapToEmployeeResponse(updatedEmployee);
    }

    @Transactional
    public void deleteEmployee(UUID id) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Employee", "id", id));

        // Soft delete - mark as inactive
        employee.setActive(false);
        employeeRepository.save(employee);

        log.info("Employee deactivated with ID: {}", id);
    }

    @Transactional
    public void activateEmployee(UUID id) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Employee", "id", id));

        employee.setActive(true);
        employeeRepository.save(employee);

        log.info("Employee activated with ID: {}", id);
    }

    public PaginatedResponse<PayrollResponse> getEmployeePayroll(UUID employeeId, int page, int limit,
                                                                 String month, PayrollStatus status) {
        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("Employee", "id", employeeId));

        Pageable pageable = PageRequest.of(page - 1, limit, Sort.by("month").descending());
        Page<Payroll> payrollPage = payrollRepository.findPayrollsByCriteria(employeeId, month, status, pageable);

        List<PayrollResponse> payrollResponses = payrollPage.getContent()
                .stream()
                .map(this::mapToPayrollResponse)
                .collect(Collectors.toList());

        return PaginatedResponse.of(payrollResponses, page, limit, payrollPage.getTotalElements());
    }

    @Transactional
    public PayrollResponse createPayroll(PayrollRequest request) {
        Employee employee = employeeRepository.findByEmployeeId(request.getEmployeeId())
                .orElseThrow(() -> new ResourceNotFoundException("Employee", "employeeId", request.getEmployeeId()));

        // Check if payroll already exists for this month
        if (payrollRepository.findByEmployeeIdAndMonth(employee.getId(), request.getMonth()).isPresent()) {
            throw new ApiException("Payroll already exists for this month", HttpStatus.BAD_REQUEST);
        }

        Payroll payroll = Payroll.builder()
                .employee(employee)
                .month(request.getMonth())
                .basicSalary(request.getBasicSalary())
                .allowances(request.getAllowances() != null ? request.getAllowances() : java.math.BigDecimal.ZERO)
                .deductions(request.getDeductions() != null ? request.getDeductions() : java.math.BigDecimal.ZERO)
                .netSalary(request.getNetSalary())
                .paymentDate(request.getPaymentDate())
                .paymentMethod(request.getPaymentMethod())
                .status(PayrollStatus.PENDING)
                .createdAt(java.time.LocalDateTime.now())
                .build();

        Payroll savedPayroll = payrollRepository.save(payroll);
        log.info("Payroll created for employee {} for month {}", employee.getEmployeeId(), request.getMonth());

        return mapToPayrollResponse(savedPayroll);
    }

    @Transactional
    public PayrollResponse updatePayrollStatus(UUID payrollId, PayrollStatus status) {
        Payroll payroll = payrollRepository.findById(payrollId)
                .orElseThrow(() -> new ResourceNotFoundException("Payroll", "id", payrollId));

        payroll.setStatus(status);
        Payroll updatedPayroll = payrollRepository.save(payroll);

        log.info("Payroll status updated to {} for ID: {}", status, payrollId);
        return mapToPayrollResponse(updatedPayroll);
    }

    public List<EmployeeResponse> getActiveEmployees() {
        List<Employee> activeEmployees = employeeRepository.findByIsActiveTrue();
        return activeEmployees.stream()
                .map(this::mapToEmployeeResponse)
                .collect(Collectors.toList());
    }

    public EmployeeResponse getEmployeeByUserId(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        Employee employee = employeeRepository.findByUser(user)
                .orElseThrow(() -> new ResourceNotFoundException("Employee", "userId", userId));

        return mapToEmployeeResponse(employee);
    }

    public long countActiveEmployees() {
        return employeeRepository.countByIsActiveTrue();
    }

    private EmployeeResponse mapToEmployeeResponse(Employee employee) {
        EmployeeResponse response = modelMapper.map(employee, EmployeeResponse.class);

        if (employee.getUser() != null) {
            response.setUserId(employee.getUser().getId());
            response.setName(employee.getUser().getName());
            response.setEmail(employee.getUser().getEmail());
            response.setPhone(employee.getUser().getPhone());
            response.setRole(employee.getUser().getRole().name());
        }

        return response;
    }

    private PayrollResponse mapToPayrollResponse(Payroll payroll) {
        PayrollResponse response = modelMapper.map(payroll, PayrollResponse.class);

        if (payroll.getEmployee() != null) {
            response.setEmployeeId(payroll.getEmployee().getId());
            response.setEmployeeName(payroll.getEmployee().getUser().getName());
            response.setEmployeeIdNumber(payroll.getEmployee().getEmployeeId());
        }

        return response;
    }
}