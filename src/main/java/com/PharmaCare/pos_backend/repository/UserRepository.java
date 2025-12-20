package com.PharmaCare.pos_backend.repository;

import com.PharmaCare.pos_backend.enums.Role;
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
public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByEmail(String email);
    boolean existsByEmail(String email);

    Page<User> findAllByRole(Role role, Pageable pageable);

    // FIXED: Use u.active instead of u.isActive if that's what's in your User entity
    @Query("SELECT u FROM User u WHERE " +
            "(:search IS NULL OR LOWER(u.name) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
            "LOWER(u.email) LIKE LOWER(CONCAT('%', :search, '%'))) AND " +
            "(:role IS NULL OR u.role = :role) AND " +
            "u.active = true")  // Changed from u.isActive to u.active
    Page<User> searchUsers(@Param("search") String search,
                           @Param("role") Role role,
                           Pageable pageable);

    // FIXED: Changed method name to match User entity field
    List<User> findAllByActiveTrue();  // Changed from findAllByIsActiveTrue

    // FIXED: Changed method name to match User entity field
    long countByRoleAndActiveTrue(Role role);  // Changed from countByRoleAndIsActiveTrue

    // FIXED: Use u.active instead of u.isActive
    @Query("SELECT COUNT(u) FROM User u WHERE u.active = true")  // Changed from u.isActive
    long countActiveUsers();
}