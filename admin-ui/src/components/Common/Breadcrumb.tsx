import React from 'react';
import { Breadcrumbs, Link, Typography } from '@mui/material';
import { NavigateNext as NavigateNextIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ items }) => {
  const navigate = useNavigate();

  return (
    <Breadcrumbs
      separator={<NavigateNextIcon fontSize="small" />}
      aria-label="breadcrumb"
      sx={{ mb: 2 }}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        if (isLast || !item.path) {
          return (
            <Typography key={index} color="text.primary" fontWeight={500}>
              {item.label}
            </Typography>
          );
        }

        return (
          <Link
            key={index}
            color="inherit"
            href={item.path}
            onClick={(e) => {
              e.preventDefault();
              if (item.path) {
                navigate(item.path);
              }
            }}
            sx={{
              cursor: 'pointer',
              '&:hover': {
                textDecoration: 'underline',
              },
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </Breadcrumbs>
  );
};

export default Breadcrumb;
