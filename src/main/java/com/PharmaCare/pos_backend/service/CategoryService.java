package com.PharmaCare.pos_backend.service;

import com.PharmaCare.pos_backend.dto.request.CategoryRequest;
import com.PharmaCare.pos_backend.dto.response.CategoryResponse;
import com.PharmaCare.pos_backend.model.Category;
import com.PharmaCare.pos_backend.exception.ApiException;
import com.PharmaCare.pos_backend.exception.ResourceNotFoundException;
import com.PharmaCare.pos_backend.repository.CategoryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.modelmapper.ModelMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class CategoryService {

    private final CategoryRepository categoryRepository;
    private final ModelMapper modelMapper;

    public List<CategoryResponse> getAllCategories() {
        List<Category> categories = categoryRepository.findAll();
        return categories.stream()
                .map(this::mapToCategoryResponse)
                .collect(Collectors.toList());
    }

    public CategoryResponse getCategoryById(UUID id) {
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Category", "id", id));
        return mapToCategoryResponse(category);
    }

    public CategoryResponse getCategoryByName(String name) {
        Category category = categoryRepository.findByName(name)
                .orElseThrow(() -> new ResourceNotFoundException("Category", "name", name));
        return mapToCategoryResponse(category);
    }

    @Transactional
    public CategoryResponse createCategory(CategoryRequest request) {
        // Check if category already exists
        if (categoryRepository.existsByName(request.getName())) {
            throw new ApiException("Category already exists", HttpStatus.BAD_REQUEST);
        }

        Category category = Category.builder()
                .name(request.getName())
                .description(request.getDescription())
                .medicineCount(0)
                .build();

        Category savedCategory = categoryRepository.save(category);
        log.info("Category created: {}", request.getName());

        return mapToCategoryResponse(savedCategory);
    }

    @Transactional
    public CategoryResponse updateCategory(UUID id, CategoryRequest request) {
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Category", "id", id));

        // Check if name is being changed and if new name already exists
        if (!category.getName().equals(request.getName()) &&
                categoryRepository.existsByName(request.getName())) {
            throw new ApiException("Category name already exists", HttpStatus.BAD_REQUEST);
        }

        category.setName(request.getName());
        category.setDescription(request.getDescription());

        Category updatedCategory = categoryRepository.save(category);
        log.info("Category updated: {}", request.getName());

        return mapToCategoryResponse(updatedCategory);
    }

    @Transactional
    public void deleteCategory(UUID id) {
        Category category = categoryRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Category", "id", id));

        // Check if category has medicines
        if (category.getMedicineCount() > 0) {
            throw new ApiException("Cannot delete category with medicines", HttpStatus.BAD_REQUEST);
        }

        categoryRepository.delete(category);
        log.info("Category deleted: {}", category.getName());
    }

    @Transactional
    public void incrementMedicineCount(String categoryName) {
        categoryRepository.findByName(categoryName).ifPresent(category -> {
            category.setMedicineCount(category.getMedicineCount() + 1);
            categoryRepository.save(category);
            log.debug("Incremented medicine count for category: {}", categoryName);
        });
    }

    @Transactional
    public void decrementMedicineCount(String categoryName) {
        categoryRepository.findByName(categoryName).ifPresent(category -> {
            category.setMedicineCount(Math.max(0, category.getMedicineCount() - 1));
            categoryRepository.save(category);
            log.debug("Decremented medicine count for category: {}", categoryName);
        });
    }

    public long countCategoriesWithMedicines() {
        return categoryRepository.countByMedicineCountGreaterThan(0);
    }

    private CategoryResponse mapToCategoryResponse(Category category) {
        return modelMapper.map(category, CategoryResponse.class);
    }
}