package com.PharmaCare.pos_backend.service;

import com.PharmaCare.pos_backend.dto.request.ExpenseRequest;
import com.PharmaCare.pos_backend.dto.response.ExpenseResponse;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.enums.ExpenseStatus;
import com.PharmaCare.pos_backend.model.Expense;

import com.PharmaCare.pos_backend.model.User;
import com.PharmaCare.pos_backend.exception.ApiException;
import com.PharmaCare.pos_backend.exception.ResourceNotFoundException;
import com.PharmaCare.pos_backend.repository.ExpenseRepository;
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

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ExpenseService {

    private final ExpenseRepository expenseRepository;
    private final UserRepository userRepository;
    private final ModelMapper modelMapper;

    public ExpenseResponse getExpenseById(UUID id) {
        Expense expense = expenseRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Expense", "id", id));
        return mapToExpenseResponse(expense);
    }

    public PaginatedResponse<ExpenseResponse> getAllExpenses(int page, int limit, String category,
                                                             LocalDate startDate, LocalDate endDate,
                                                             ExpenseStatus status) {
        Pageable pageable = PageRequest.of(page - 1, limit, Sort.by("date").descending());

        Page<Expense> expensesPage = expenseRepository.findExpensesByCriteria(
                startDate, endDate, category, status, pageable);

        List<ExpenseResponse> expenseResponses = expensesPage.getContent()
                .stream()
                .map(this::mapToExpenseResponse)
                .collect(Collectors.toList());

        return PaginatedResponse.of(expenseResponses, page, limit, expensesPage.getTotalElements());
    }

    @Transactional
    public ExpenseResponse createExpense(ExpenseRequest request) {
        User createdBy = userRepository.findById(UUID.fromString(request.getCreatedBy()))
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", request.getCreatedBy()));

        Expense expense = Expense.builder()
                .title(request.getTitle())
                .description(request.getDescription())
                .amount(request.getAmount())
                .category(request.getCategory())
                .status(ExpenseStatus.PENDING)
                .date(request.getDate())
                .receiptUrl(request.getReceiptUrl())
                .createdBy(createdBy)
                .createdByName(createdBy.getName())
                .createdAt(java.time.LocalDateTime.now())
                .build();

        Expense savedExpense = expenseRepository.save(expense);
        log.info("Expense created with ID: {}", savedExpense.getId());

        return mapToExpenseResponse(savedExpense);
    }

    @Transactional
    public ExpenseResponse updateExpense(UUID id, ExpenseRequest request) {
        Expense expense = expenseRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Expense", "id", id));

        // Only allow updates if expense is pending
        if (expense.getStatus() != ExpenseStatus.PENDING) {
            throw new ApiException("Only pending expenses can be updated", HttpStatus.BAD_REQUEST);
        }

        expense.setTitle(request.getTitle());
        expense.setDescription(request.getDescription());
        expense.setAmount(request.getAmount());
        expense.setCategory(request.getCategory());
        expense.setDate(request.getDate());
        expense.setReceiptUrl(request.getReceiptUrl());

        Expense updatedExpense = expenseRepository.save(expense);
        log.info("Expense updated with ID: {}", id);

        return mapToExpenseResponse(updatedExpense);
    }

    @Transactional
    public void deleteExpense(UUID id) {
        Expense expense = expenseRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Expense", "id", id));

        // Only allow deletion if expense is pending
        if (expense.getStatus() != ExpenseStatus.PENDING) {
            throw new ApiException("Only pending expenses can be deleted", HttpStatus.BAD_REQUEST);
        }

        expenseRepository.delete(expense);
        log.info("Expense deleted with ID: {}", id);
    }

    @Transactional
    public ExpenseResponse approveExpense(UUID id, UUID approvedById) {
        Expense expense = expenseRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Expense", "id", id));

        User approvedBy = userRepository.findById(approvedById)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", approvedById));

        // Check if expense is pending
        if (expense.getStatus() != ExpenseStatus.PENDING) {
            throw new ApiException("Only pending expenses can be approved", HttpStatus.BAD_REQUEST);
        }

        expense.setStatus(ExpenseStatus.APPROVED);
        expense.setApprovedBy(approvedBy);
        expense.setApprovedByName(approvedBy.getName());
        expense.setUpdatedAt(java.time.LocalDateTime.now());

        Expense updatedExpense = expenseRepository.save(expense);
        log.info("Expense approved with ID: {}", id);

        return mapToExpenseResponse(updatedExpense);
    }

    @Transactional
    public ExpenseResponse rejectExpense(UUID id, UUID rejectedById, String reason) {
        Expense expense = expenseRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Expense", "id", id));

        User rejectedBy = userRepository.findById(rejectedById)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", rejectedById));

        // Check if expense is pending
        if (expense.getStatus() != ExpenseStatus.PENDING) {
            throw new ApiException("Only pending expenses can be rejected", HttpStatus.BAD_REQUEST);
        }

        expense.setStatus(ExpenseStatus.REJECTED);
        expense.setRejectedBy(rejectedBy);
        expense.setRejectionReason(reason);
        expense.setUpdatedAt(java.time.LocalDateTime.now());

        Expense updatedExpense = expenseRepository.save(expense);
        log.info("Expense rejected with ID: {}", id);

        return mapToExpenseResponse(updatedExpense);
    }

    public List<ExpenseResponse> getPendingExpenses() {
        Page<Expense> pendingExpenses = expenseRepository.findByStatus(
                ExpenseStatus.PENDING, PageRequest.of(0, 100, Sort.by("createdAt").ascending()));

        return pendingExpenses.getContent()
                .stream()
                .map(this::mapToExpenseResponse)
                .collect(Collectors.toList());
    }

    public List<ExpenseResponse> getExpensesByCategory(String category) {
        Page<Expense> expenses = expenseRepository.findByCategory(
                category, PageRequest.of(0, 100, Sort.by("date").descending()));

        return expenses.getContent()
                .stream()
                .map(this::mapToExpenseResponse)
                .collect(Collectors.toList());
    }

    public BigDecimal getTotalExpensesForPeriod(LocalDate startDate, LocalDate endDate) {
        BigDecimal total = expenseRepository.getTotalExpensesForPeriod(startDate, endDate);
        return total != null ? total : BigDecimal.ZERO;
    }

    public long countExpensesByStatus(ExpenseStatus status) {
        return expenseRepository.countByStatus(status);
    }

    private ExpenseResponse mapToExpenseResponse(Expense expense) {
        ExpenseResponse response = modelMapper.map(expense, ExpenseResponse.class);

        if (expense.getCreatedBy() != null) {
            response.setCreatedBy(expense.getCreatedBy().getId());
        }
        if (expense.getApprovedBy() != null) {
            response.setApprovedBy(expense.getApprovedBy().getId());
        }
        if (expense.getRejectedBy() != null) {
            response.setRejectedBy(expense.getRejectedBy().getId());
        }

        return response;
    }
}