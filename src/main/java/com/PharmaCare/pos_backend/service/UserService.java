package com.PharmaCare.pos_backend.service;

import com.PharmaCare.pos_backend.dto.request.UserRequest;
import com.PharmaCare.pos_backend.dto.response.PaginatedResponse;
import com.PharmaCare.pos_backend.dto.response.UserResponse;
import com.PharmaCare.pos_backend.enums.Role;
import com.PharmaCare.pos_backend.model.User;
import com.PharmaCare.pos_backend.exception.ApiException;
import com.PharmaCare.pos_backend.exception.ResourceNotFoundException;
import com.PharmaCare.pos_backend.exception.UnauthorizedException;
import com.PharmaCare.pos_backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.modelmapper.ModelMapper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {

    private final UserRepository userRepository;
    private final ModelMapper modelMapper;
    private final PasswordEncoder passwordEncoder;

    public UserResponse getUserById(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", id));
        return mapToUserResponse(user);
    }

    public PaginatedResponse<UserResponse> getAllUsers(int page, int limit, String search, Role role) {
        Pageable pageable = PageRequest.of(page - 1, limit, Sort.by("createdAt").descending());
        Page<User> usersPage = userRepository.searchUsers(search, role, pageable);

        List<UserResponse> userResponses = usersPage.getContent()
                .stream()
                .map(this::mapToUserResponse)
                .collect(Collectors.toList());

        return PaginatedResponse.of(userResponses, page, limit, usersPage.getTotalElements());
    }

    @Transactional
    public UserResponse createUser(UserRequest request) {
        // Check if email already exists
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new ApiException("Email already registered", HttpStatus.BAD_REQUEST);
        }

        // Create new user with encoded password
        User user = User.builder()
                .name(request.getName())
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword())) // Encode the password
                .role(request.getRole())
                .phone(request.getPhone())
                .active(request.getIsActive() != null ? request.getIsActive() : true)
                .build();

        User savedUser = userRepository.save(user);
        log.info("User created with ID: {}", savedUser.getId());
        log.info("User details - Name: {}, Email: {}, Role: {}",
                savedUser.getName(), savedUser.getEmail(), savedUser.getRole());

        return mapToUserResponse(savedUser);
    }

    @Transactional
    public UserResponse updateUser(UUID id, UserRequest request) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", id));

        // Check if email is being changed and if new email already exists
        if (!user.getEmail().equals(request.getEmail()) &&
                userRepository.existsByEmail(request.getEmail())) {
            throw new ApiException("Email already registered", HttpStatus.BAD_REQUEST);
        }

        // Update user fields
        user.setName(request.getName());
        user.setEmail(request.getEmail());
        user.setRole(request.getRole());
        user.setPhone(request.getPhone());

        // Update password if provided
        if (request.getPassword() != null && !request.getPassword().trim().isEmpty()) {
            user.setPassword(passwordEncoder.encode(request.getPassword()));
        }

        if (request.getIsActive() != null) {
            user.setActive(request.getIsActive());
        }

        User updatedUser = userRepository.save(user);
        log.info("User updated with ID: {}", id);

        return mapToUserResponse(updatedUser);
    }

    @Transactional
    public void deactivateUser(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", id));

        user.setActive(false);
        userRepository.save(user);

        log.info("User deactivated with ID: {}", id);
    }

    @Transactional
    public UserResponse activateUser(UUID id) {
        User user = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", id));

        user.setActive(true);
        User activatedUser = userRepository.save(user);

        log.info("User activated with ID: {}", id);
        return mapToUserResponse(activatedUser);
    }

    public UserResponse getCurrentUserProfile() {
        User currentUser = getCurrentUser();
        return mapToUserResponse(currentUser);
    }

    @Transactional
    public UserResponse updateCurrentUserProfile(UserRequest request) {
        User currentUser = getCurrentUser();

        // Only allow updating name and phone for current user
        currentUser.setName(request.getName());
        if (request.getPhone() != null) {
            currentUser.setPhone(request.getPhone());
        }

        // Update password if provided
        if (request.getPassword() != null && !request.getPassword().trim().isEmpty()) {
            currentUser.setPassword(passwordEncoder.encode(request.getPassword()));
        }

        User updatedUser = userRepository.save(currentUser);
        return mapToUserResponse(updatedUser);
    }

    public List<UserResponse> getUsersByRole(Role role) {
        Pageable pageable = PageRequest.of(0, 100, Sort.by("name"));
        List<User> users = userRepository.findAllByRole(role, pageable).getContent();
        return users.stream()
                .map(this::mapToUserResponse)
                .collect(Collectors.toList());
    }

    public long countActiveUsers() {
        return userRepository.countActiveUsers();
    }

    public long countUsersByRole(Role role) {
        return userRepository.countByRoleAndActiveTrue(role);
    }

    public User getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new UnauthorizedException("User not authenticated");
        }

        String email = authentication.getName();
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new UnauthorizedException("User not found"));
    }

    public UserResponse mapToUserResponse(User user) {
        if (user == null) return null;

        return UserResponse.builder()
                .id(user.getId())
                .name(user.getName())
                .email(user.getEmail())
                .role(user.getRole())
                .phone(user.getPhone())
                .isActive(user.isEnabled())
                .createdAt(user.getCreatedAt())
                .updatedAt(user.getUpdatedAt())
                .build();
    }
}