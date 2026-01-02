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
    Optional<User> findByName(String name); // ADD THIS METHOD

    boolean existsByEmail(String email);
    boolean existsByPhone(String phone); // Optional: if you need phone validation

    Page<User> findAllByRole(Role role, Pageable pageable);

    // FIXED: Use COALESCE for null handling and proper PostgreSQL casting
    @Query("SELECT u FROM User u WHERE " +
            "(COALESCE(:search, '') = '' OR " +
            "LOWER(u.name) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
            "LOWER(u.email) LIKE LOWER(CONCAT('%', :search, '%'))) AND " +
            "(:role IS NULL OR u.role = :role) AND " +
            "u.active = true")
    Page<User> searchUsers(@Param("search") String search,
                           @Param("role") Role role,
                           Pageable pageable);

    List<User> findAllByActiveTrue();

    long countByRoleAndActiveTrue(Role role);

    @Query("SELECT COUNT(u) FROM User u WHERE u.active = true")
    long countActiveUsers();
}